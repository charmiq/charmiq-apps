import { DesignError, DesignExists, displayName, TOP_OF_DRIVE, type DesignStore, type Saved } from './designs';
import type { Design, Folder } from './drive';

import './design-dialog.scss'/*styles the dialog wherever it is used*/;

// the save and open dialog of the Brick family's designs. Save names the design and
// shows the folder it goes to, which the folder chooser changes; open walks the
// folders and lists their designs. A name already in the folder is confirmed first.
// What a save writes and what picking a design does are the app's (`save`, `choose`):
// the dialog calls a design by the app's word for it (SEE: designs.ts DesignWords)
// ********************************************************************************
// == Constants ===================================================================
/** how long after typing stops a folder search runs */
const SEARCH_DELAY_MS = 250/*ms*/;
/** how long a finished save shows before the dialog closes */
const SAVED_SHOWN_MS = 900/*ms*/;

// == Types =======================================================================
type View =
  | Readonly<{ kind: 'save'; }>
  | Readonly<{ kind: 'choose'; }>/*the folder a save goes to*/
  | Readonly<{ kind: 'open'; }>;

// == Class =======================================================================
export abstract class DesignDialog {
  private view: View = { kind: 'save' };
  /** the folders walked into, the top of the Drive first */
  private path: Folder[] = [TOP_OF_DRIVE];
  private search = '';
  private searchTimer: number | undefined;
  /** the name last saved or opened, offered by the next save */
  protected lastName = '';
  /** bumped on every render, so a listing that lands after the view moved on is dropped */
  protected generation = 0;

  public constructor(protected readonly dialog: HTMLDialogElement, protected readonly store: DesignStore) {
    dialog.addEventListener('close', () => { window.clearTimeout(this.searchTimer); this.generation++; });
    // the save view shows the folder the app state names now, keeping a name being typed
    store.onFolderChange(() => {
      if(!this.dialog.open || (this.view.kind !== 'save')) return/*nothing shows the folder*/;
      this.lastName = this.dialog.querySelector<HTMLInputElement>('#designName')?.value ?? this.lastName;
      this.renderSave();
    });
  }

  public get isOpen(): boolean { return this.dialog.open; }

  // == The App's =================================================================
  /** saves under a name: a name already in the folder refuses (DesignExists) unless
   *  `replace` says to write over it */
  protected abstract save(name: string, replace: boolean): Promise<Saved>;
  /** a design picked in the open list */
  protected abstract choose(design: Design): void | Promise<void>;

  // == Open ======================================================================
  public openSave(): void { this.show({ kind: 'save' }); }

  public openOpen(): void {
    const folder = this.store.getFolder();
    this.path = folder.id ? [TOP_OF_DRIVE, folder] : [TOP_OF_DRIVE];
    this.search = '';
    this.show({ kind: 'open' });
  }

  /** shows the open list again, as it was */
  protected reopen(): void { this.show({ kind: 'open' }); }

  // == Views =====================================================================
  private show(view: View): void {
    this.view = view;
    this.generation++;
    if(view.kind === 'save') this.renderSave();
    else this.renderBrowser();
    if(!this.dialog.open) this.dialog.showModal();
  }

  /** shows a form of the app's in the dialog: a title, what it says, a message line
   *  and its actions, the first of `focus` focused */
  protected showForm(title: string, text: string | undefined, message: HTMLElement, buttons: ReadonlyArray<HTMLButtonElement>, focus?: HTMLButtonElement): void {
    this.generation++;
    this.dialog.replaceChildren(element('div', { className: 'designs-form' },
      heading(title),
      ...((text !== undefined) ? [element('p', { className: 'designs-confirm' }, text)] : []),
      message,
      actions(...buttons)));
    if(!this.dialog.open) this.dialog.showModal();
    focus?.focus();
  }

  // .. Save ......................................................................
  private renderSave(): void {
    const { noun } = this.store.words;
    const folder = this.store.getFolder();
    const name = input('designName', 'text', 'Name', this.lastName);
    const message = paragraph('designs-message');
    const save = button('Save', 'designs-primary', 'submit');
    const changeFolder = button('Change folder', 'designs-link', 'button', () => { this.lastName = name.value; this.path = folder.id ? [TOP_OF_DRIVE, folder] : [TOP_OF_DRIVE]; this.search = ''; this.show({ kind: 'choose' }); });
    const cancel = button('Cancel', 'designs-secondary', 'button', () => this.dialog.close());
    const form = element('form', { className: 'designs-form' },
      heading(`Save ${noun}`),
      label('Name', name),
      element('p', { className: 'designs-where' }, 'In ', element('strong', {}, folder.name), ' ', changeFolder),
      message,
      actions(cancel, save));

    // the whole form waits while saving; a save that lands stays that way until the
    // dialog closes, so nothing in it comes back to life in between
    let replace = false;
    form.addEventListener('submit', event => {
      event.preventDefault();
      save.textContent = 'Saving…';
      void this.run(message, [name, changeFolder, cancel, save], async () => {
        const saved = await this.save(name.value, replace);
        this.lastName = saved.name;
        save.textContent = 'Saved';
        message.className = 'designs-message is-done';
        const where = saved.folder ? ` ${saved.replaced ? 'in' : 'to'} ${saved.folder.name}` : '';
        message.textContent = `${saved.replaced ? 'Replaced' : 'Saved'} "${saved.name}"${where}.`;
        window.setTimeout(() => this.dialog.close(), SAVED_SHOWN_MS);
      }, error => {
        replace = (error instanceof DesignExists);
        save.textContent = replace ? 'Replace' : 'Save';
        if(!replace) return false;
        message.textContent = `${(error as DesignExists).message} Replace it?`;
        return true;
      });
    });
    name.addEventListener('input', () => { replace = false; save.textContent = 'Save'; });
    this.dialog.replaceChildren(form);
    name.focus();
    name.select();
  }

  // .. Folders and designs .......................................................
  /** the folder chooser (a save's folder) or the open list (folders and designs) */
  private renderBrowser(): void {
    const { noun } = this.store.words;
    const choosing = (this.view.kind === 'choose');
    const here = this.path[this.path.length - 1];
    const list = element('ul', { className: 'designs-list', role: 'list' });
    const message = paragraph('designs-message');
    const searchBox = input('designSearch', 'search', 'Search folders by name', this.search);
    const back = button('Back', 'designs-link', 'button', () => { this.path = this.path.slice(0, -1); this.show(this.view); });
    back.hidden = (this.path.length < 2) || (this.search.length > 0);

    const footer = choosing
      ? actions(button('Cancel', 'designs-secondary', 'button', () => this.show({ kind: 'save' })),
          button('Use this folder', 'designs-primary', 'button', () => void this.run(message, [], async () => { await this.store.setFolder(here); this.show({ kind: 'save' }); })))
      : actions(button('Cancel', 'designs-secondary', 'button', () => this.dialog.close()));

    this.dialog.replaceChildren(element('div', { className: 'designs-form' },
      heading(choosing ? 'Choose a folder' : `Open ${noun}`),
      element('div', { className: 'designs-path' }, back, element('span', { className: 'designs-here' }, (this.search.length > 0) ? 'Folders matching your search' : here.name)),
      label('Search', searchBox),
      list,
      ...(choosing && (this.search.length < 1) ? [this.newFolderRow(here, message)] : []),
      message,
      footer));

    searchBox.addEventListener('input', () => {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => { this.search = searchBox.value.trim(); this.show(this.view); searchFocus(this.dialog); }, SEARCH_DELAY_MS);
    });
    void this.fill(list, message, here, !choosing, 0);
  }

  /** lists a page of folders (and, when opening, designs) into the list */
  private async fill(list: HTMLElement, message: HTMLElement, here: Folder, withDesigns: boolean, offset: number): Promise<void> {
    const { noun } = this.store.words;
    const generation = this.generation;
    const loading = element('li', { className: 'designs-note' }, 'Reading folders…');
    list.append(loading);
    try {
      const page = (this.search.length > 0)
        ? { ...(await this.store.searchFolders(this.search, offset)), designs: [] as ReadonlyArray<Design>, read: 0 }
        : await this.store.browse(here, offset);
      if(generation !== this.generation) return/*the view moved on*/;
      loading.remove();

      for(const folder of page.folders) {
        list.append(element('li', {}, row('folder', folder.name, () => {
          this.path = (this.search.length > 0) ? [TOP_OF_DRIVE, folder] : [...this.path, folder];
          this.search = '';
          this.show(this.view);
        })));
      }
      for(const design of withDesigns ? page.designs : []) {
        list.append(element('li', {}, row('design', displayName(design), () => void this.choose(design))));
      }
      // a folder lists a page at a time; a search shows its first page, and more is
      // a cue to refine it
      if(page.hasMore && (this.search.length > 0)) {
        list.append(element('li', { className: 'designs-note' }, 'More folders match · refine your search'));
      } else if(page.hasMore) {
        const more = button('More', 'designs-link', 'button', () => { more.parentElement?.remove(); void this.fill(list, message, here, withDesigns, offset + page.read); });
        list.append(element('li', { className: 'designs-note' }, more));
      } /* else -- everything is listed */
      if((offset === 0) && (list.childElementCount < 1)) {
        list.append(element('li', { className: 'designs-note' }, (this.search.length > 0) ? 'No folder matches that name.' : withDesigns ? `No folders or ${noun}s here.` : 'No folders here.'));
      } /* else -- something is listed */
    } catch(error) {
      if(generation !== this.generation) return;
      loading.remove();
      showError(message, error);
    }
  }

  /** the row that makes a folder inside the one shown */
  private newFolderRow(here: Folder, message: HTMLElement): HTMLElement {
    const name = input('designFolderName', 'text', 'New folder', '');
    const create = button('Create', 'designs-secondary', 'button', () => void this.run(message, [create], async () => {
      const folder = await this.store.createFolder(here, name.value);
      this.path = [...this.path, folder];
      this.show(this.view);
    }));
    name.addEventListener('keydown', event => { if(event.key === 'Enter') { event.preventDefault(); create.click(); } });
    return element('div', { className: 'designs-new' }, label('New folder', name), create);
  }

  // .. Util ......................................................................
  /** runs an action with its controls disabled, showing a refusal in the message;
   *  `handled` takes a refusal the caller answers itself. The controls come back on
   *  a refusal only: an action that lands moves the dialog on or closes it */
  protected async run(message: HTMLElement, busy: ReadonlyArray<HTMLButtonElement | HTMLInputElement>, action: () => Promise<void>, handled?: (error: unknown) => boolean): Promise<void> {
    for(const control of busy) control.disabled = true;
    message.className = 'designs-message';
    message.textContent = '';
    try {
      await action();
    } catch(error) {
      for(const control of busy) control.disabled = false;
      if(!handled?.(error)) showError(message, error);
    }
  }
}

// == DOM =========================================================================
type Child = Node | string;

export const element = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { role?: string; }, ...children: Child[]): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  const { role, ...rest } = props;
  Object.assign(node, rest);
  if(role) node.setAttribute('role', role);
  node.append(...children);
  return node;
};

export const heading = (text: string) => element('h2', { className: 'designs-title' }, text);
export const paragraph = (className: string) => { const node = element('p', { className }); node.setAttribute('role', 'status'); return node; };
export const actions = (...buttons: HTMLButtonElement[]) => element('div', { className: 'designs-actions' }, ...buttons);
const label = (text: string, control: HTMLInputElement) => element('label', { className: 'designs-field' }, element('span', { className: 'designs-label' }, text), control);

const input = (id: string, type: string, placeholder: string, value: string): HTMLInputElement =>
  element('input', { id, type, placeholder, value, autocomplete: 'off', spellcheck: false, className: 'designs-input' });

export const button = (text: string, className: string, type: 'button' | 'submit', onClick?: () => void): HTMLButtonElement => {
  const node = element('button', { type, className }, text);
  if(onClick) node.addEventListener('click', onClick);
  return node;
};

/** a folder or design in a list: its icon and its name, cut short when long */
const row = (kind: 'folder' | 'design', name: string, onClick: () => void): HTMLButtonElement => {
  const node = button('', `designs-row designs-row--${kind}`, 'button', onClick);
  node.title = name;
  node.append(icon(kind), element('span', { className: 'designs-name' }, name));
  return node;
};

/** the Material `folder` and `deployed_code` glyphs, drawn inline */
const icon = (kind: 'folder' | 'design'): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 -960 960 960');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', (kind === 'folder')
    ? 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z'
    : 'M440-183v-274L200-596v274l240 139Zm80 0 240-139v-274L520-457v274Zm-80 92L160-252q-19-11-29.5-29T120-321v-318q0-22 10.5-40t29.5-29l280-161q19-11 40-11t40 11l280 161q19 11 29.5 29t10.5 40v318q0 22-10.5 40T800-252L520-91q-19 11-40 11t-40-11Zm200-528 77-44-237-137-78 45 238 136Zm-160 93 78-45-237-137-78 45 237 137Z');
  svg.append(path);
  return svg;
};

/** a refusal's message where the User reads it */
export const showError = (message: HTMLElement, error: unknown): void => {
  message.className = 'designs-message is-error';
  message.textContent = (error instanceof DesignError) ? error.message : `The Drive could not do that: ${(error instanceof Error) ? error.message : String(error)}`;
};

/** keeps typing in the search box after the list redraws */
const searchFocus = (dialog: HTMLDialogElement): void => {
  const box = dialog.querySelector<HTMLInputElement>('#designSearch');
  if(!box) return;
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
};
