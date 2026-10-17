import type { Build } from './build';
import { MAIN_SET, type Model } from './model';

// the set menu: a tag naming the set shown that opens a menu of the build's sets,
// absent for a build of one. Choosing one shows it (never an edit); the tag follows
// the set the studio shows, whoever showed it
// ********************************************************************************
// == Types =======================================================================
export type SetControlElements = Readonly<{
  root: HTMLElement;
  button: HTMLButtonElement;
  menu: HTMLElement;
}>;

// == Class =======================================================================
export class SetControl {
  public constructor(private readonly elements: SetControlElements, private readonly build: Build) {
    const { root, button } = elements;
    button.addEventListener('click', () => this.toggle());
    document.addEventListener('pointerdown', event => { if(!root.contains(event.target as Node)) this.close(); });
    root.addEventListener('keydown', event => { if(event.key === 'Escape') { this.close(); button.focus(); } });
    root.hidden = true/*until a build of more than one set shows*/;
  }

  /** shows the sets of the model shown, and which it is */
  public show(model: Model): void {
    const { root, button, menu } = this.elements;
    const sets = model.sets ?? [];
    root.hidden = (sets.length < 2);
    if(root.hidden) { this.close(); return; }
    const shown = model.set ?? MAIN_SET;
    button.textContent = shown;
    button.title = button.ariaLabel = `Set: ${shown}`;
    menu.replaceChildren(...sets.map(({ name }) => this.choice(name, name === shown)));
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

  /** a menu item: a set by name, checked when it is the set shown */
  private choice(name: string, checked: boolean): HTMLButtonElement {
    const item = document.createElement('button');
    item.className = 'set-choice';
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(checked));
    item.textContent = item.title = name;
    item.addEventListener('click', () => {
      this.close();
      this.elements.button.focus();
      this.build.showSet(name);
    });
    return item;
  }
}
