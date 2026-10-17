import { COLORS } from './catalog';
import type { Build } from './build';
import { getColor, getColorValue } from './grid';
import type { Model } from './model';

// the ground swatch: a tag in the build's ground color that opens a menu of the
// catalog's colors and the theme's. Choosing one edits the build (its ground line);
// the swatch follows the build, never the click, so a change from anywhere shows. A
// change the build refuses is reported (`onRefused`), its reason with it, for the
// latest choice alone: an older choice refused after a newer one landed says nothing
// ********************************************************************************
// == Types =======================================================================
export type GroundControlElements = Readonly<{
  root: HTMLElement;
  button: HTMLButtonElement;
  menu: HTMLElement;
}>;

// == Class =======================================================================
export class GroundControl {
  private ground: string | undefined/*catalog color key*/;
  /** counts the choices made, so only the latest one's refusal is reported */
  private choices = 0;

  public constructor(private readonly elements: GroundControlElements, private readonly build: Build, private readonly onRefused: (reason: string) => void) {
    const { root, button, menu } = elements;
    menu.append(
      ...COLORS.filter(color => !color.transparent).map(color => this.choice(color.key, color.key.replace(/-/g, ' '), getColorValue(color.code))),
      this.choice(undefined, 'Theme', undefined),
    );
    button.addEventListener('click', () => this.toggle());
    document.addEventListener('pointerdown', event => { if(!root.contains(event.target as Node)) this.close(); });
    root.addEventListener('keydown', event => { if(event.key === 'Escape') { this.close(); button.focus(); } });
    this.render();
  }

  /** shows the ground of a build whose text is new */
  public show(model: Model): void {
    this.ground = model.ground;
    this.render();
  }

  // == Menu ======================================================================
  private toggle(): void {
    const opening = this.elements.menu.hidden;
    this.elements.menu.hidden = !opening;
    this.elements.button.setAttribute('aria-expanded', String(opening));
    if(opening) this.elements.menu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }

  private close(): void {
    this.elements.menu.hidden = true;
    this.elements.button.setAttribute('aria-expanded', 'false');
  }

  /** a menu item: a catalog color, or the theme's (`undefined`) */
  private choice(key: string | undefined, label: string, value: string | undefined): HTMLButtonElement {
    const item = document.createElement('button');
    item.className = (key === undefined) ? 'ground-theme' : 'ground-swatch';
    item.setAttribute('role', 'menuitemradio');
    item.dataset.ground = key ?? '';
    item.title = label;
    item.ariaLabel = label;
    if(value) item.style.setProperty('--swatch', value);
    if(key === undefined) item.textContent = label;
    item.addEventListener('click', () => {
      this.close();
      const choice = ++this.choices;
      this.build.setGround(key, this.build.shownSet()).catch(error => {
        console.warn('brick-studio: the ground could not be changed:', error);
        if(choice === this.choices) this.onRefused((error instanceof Error) ? error.message : String(error))/*a later choice owns the status otherwise*/;
      });
    });
    return item;
  }

  // == Render ====================================================================
  private render(): void {
    const { button, menu } = this.elements;
    const value = (this.ground === undefined) ? undefined : getColorValue(getColor(this.ground)!.code/*by contract*/);
    if(value) button.style.setProperty('--swatch', value);
    else button.style.removeProperty('--swatch')/*the theme's baseplate*/;
    button.title = button.ariaLabel = `Ground: ${(this.ground ?? 'theme').replace(/-/g, ' ')}`;
    for(const item of menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')) {
      item.setAttribute('aria-checked', String(item.dataset.ground === (this.ground ?? '')));
    }
  }
}
