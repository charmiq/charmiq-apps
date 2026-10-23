import type { PickDialog } from '../../brick-shared/pick-dialog';
import { drawnSky, DEFAULT_SKY, MAX_SEED, type Sky } from '../../brick-shared/sky';

import type { Build } from './build';
import type { Model } from './model';

// the sky swatch: a tag showing the set's sky (its gradient, a picture's mark over it)
// that opens a panel: the theme's backdrop, a generated sky (its horizon and overhead
// colors, its clouds, other clouds alike) or a picture from the Drive, and whether the
// sky lights the set. Each change edits the build (the set's sky line) once it is
// made: a color once its picker closes, the clouds once the slider is let go. The
// panel follows the build, never the click, so a change from anywhere shows; a change
// the build refuses is reported (`onRefused`) for the latest choice alone
// ********************************************************************************
// == Types =======================================================================
export type SkyControlElements = Readonly<{
  root: HTMLElement;
  button: HTMLButtonElement;
  panel: HTMLElement;
  /** the three kinds: the theme's, generated, a picture */
  theme: HTMLButtonElement;
  generated: HTMLButtonElement;
  picture: HTMLButtonElement;
  /** the generated sky's values */
  horizon: HTMLInputElement;
  zenith: HTMLInputElement;
  clouds: HTMLInputElement;
  reseed: HTMLButtonElement;
  /** the picture's: what it is, and the way to pick another */
  pictureName: HTMLElement;
  pick: HTMLButtonElement;
  lights: HTMLInputElement;
}>;

// == Class =======================================================================
export class SkyControl {
  private sky: Sky | undefined/*the theme's backdrop*/;
  /** each picture's file name, read once where it shows */
  private readonly names = new Map<string, Promise<string>>();
  /** counts the choices made, so only the latest one's refusal is reported */
  private choices = 0;

  public constructor(private readonly elements: SkyControlElements, private readonly build: Build, private readonly pictures: PickDialog | undefined/*no Drive here*/, private readonly nameOf: (uri: string) => Promise<string>/*a Drive file's name*/, private readonly onRefused: (reason: string) => void) {
    const { root, button, panel, theme, generated, picture, horizon, zenith, clouds, reseed, pick, lights } = elements;
    button.addEventListener('click', () => this.toggle());
    document.addEventListener('pointerdown', event => { if(!root.contains(event.target as Node) && !(event.target as Element).closest?.('dialog')) this.close(); });
    root.addEventListener('keydown', event => { if((event.key === 'Escape') && !panel.hidden) { this.close(); button.focus(); } });
    theme.addEventListener('click', () => this.write(undefined));
    generated.addEventListener('click', () => this.write(this.generatedNow()));
    picture.addEventListener('click', () => this.pickPicture());
    pick.addEventListener('click', () => this.pickPicture());
    for(const input of [horizon, zenith, clouds]) input.addEventListener('change', () => this.write(this.generatedNow()));
    reseed.addEventListener('click', () => this.write({ ...this.generatedNow(), seed: ((this.sky?.seed ?? DEFAULT_SKY.seed) % MAX_SEED) + 1 }));
    lights.addEventListener('change', () => { if(this.sky) this.write({ ...this.sky, lights: lights.checked || undefined }); });
    picture.disabled = pick.disabled = !pictures;
    this.render();
  }

  /** shows the sky of a build whose text is new */
  public show(model: Model): void {
    this.sky = model.sky;
    this.render();
  }

  // == Panel =====================================================================
  private toggle(): void {
    const opening = this.elements.panel.hidden;
    this.elements.panel.hidden = !opening;
    this.elements.button.setAttribute('aria-expanded', String(opening));
    if(opening) this.elements.panel.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }

  private close(): void {
    this.elements.panel.hidden = true;
    this.elements.button.setAttribute('aria-expanded', 'false');
  }

  // == Choices ===================================================================
  /** the generated sky the panel's values say, lighting as the sky shown does */
  private generatedNow(): Sky {
    const { horizon, zenith, clouds } = this.elements;
    return { horizon: horizon.value.toUpperCase(), zenith: zenith.value.toUpperCase(), clouds: Number(clouds.value), seed: this.sky?.seed ?? DEFAULT_SKY.seed, ...(this.sky?.lights ? { lights: true as const } : {}) };
  }

  /** opens the Drive's pictures; the one picked becomes the sky, its colors kept as the
   *  sky drawn while it is read */
  private pickPicture(): void {
    this.close();
    this.pictures?.open();
  }

  /** the sky a picture picked makes: the picture over the colors shown */
  public pictured(uri: string): Promise<void> {
    const { horizon, zenith } = drawnSky(this.sky ?? {});
    return this.write({ horizon, zenith, image: uri, ...(this.sky?.lights ? { lights: true as const } : {}) }, true);
  }

  /** edits the set shown's sky; a refusal is reported for the latest choice, or thrown
   *  to the picture dialog that asked (`thrown`) */
  private write(sky: Sky | undefined, thrown = false): Promise<void> {
    const choice = ++this.choices;
    return this.build.setSky(sky, this.build.shownSet()).then(() => undefined, (error: unknown) => {
      console.warn('brick-studio: the sky could not be changed:', error);
      if(thrown) throw error;
      if(choice === this.choices) this.onRefused((error instanceof Error) ? error.message : String(error))/*a later choice owns the status otherwise*/;
    });
  }

  // == Render ====================================================================
  /** the picture's file name where it shows, read once (its uri where it cannot be) */
  private showName(uri: string | undefined): void {
    const { pictureName } = this.elements;
    pictureName.textContent = (uri === undefined) ? '' : 'Reading its name…';
    if(uri === undefined) return/*no picture*/;
    let name = this.names.get(uri);
    if(!name) { name = this.nameOf(uri).catch(() => uri); this.names.set(uri, name); }
    void name.then(read => { if(this.sky?.image === uri) pictureName.textContent = read; });
  }

  private render(): void {
    const { button, theme, generated, picture, horizon, zenith, clouds, reseed, pictureName, pick, lights } = this.elements;
    const sky = this.sky, drawn = drawnSky(sky ?? {});
    const kind = !sky ? 'theme' : (sky.image !== undefined) ? 'picture' : 'generated';
    if(sky) button.style.setProperty('--sky', `linear-gradient(${drawn.zenith}, ${drawn.horizon})`);
    else button.style.removeProperty('--sky')/*the theme's backdrop*/;
    button.classList.toggle('is-picture', kind === 'picture');
    button.title = button.ariaLabel = `Sky: ${(kind === 'theme') ? 'theme' : (kind === 'picture') ? 'a picture' : 'generated'}`;
    for(const [each, name] of [[theme, 'theme'], [generated, 'generated'], [picture, 'picture']] as const) each.setAttribute('aria-checked', String(kind === name));
    horizon.value = drawn.horizon.toLowerCase();
    zenith.value = drawn.zenith.toLowerCase();
    clouds.value = String(drawn.clouds);
    for(const input of [horizon, zenith, clouds, reseed]) input.closest<HTMLElement>('.sky-row')!.hidden = (kind !== 'generated');
    pictureName.closest<HTMLElement>('.sky-row')!.hidden = pick.hidden = (kind !== 'picture');
    this.showName(sky?.image);
    lights.checked = !!sky?.lights;
    lights.disabled = !sky;
  }
}
