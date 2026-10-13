import { DesignError, DesignExists, displayName, TOP_OF_DRIVE, type Designs } from './designs';
import type { Design, Folder } from './drive';

// the save and open dialog over the studio. Save names the design and shows the
// folder it goes to, which the folder chooser changes; open walks the folders and
// lists their designs. A name already in the folder, and a build that a design
// would replace, are confirmed first. Everything it does goes through Designs
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

/** what the dialog asks of the studio */
export type DesignDialogHost = Readonly<{
  /** how many parts the build holds (a load that would replace them asks first) */
  partCount: () => number;
  /** a design has replaced the build */
  onLoaded: (name: string) => void;
}>;

// == Class =======================================================================
export class DesignDialog {
  private view: View = { kind: 'save' };
  /** the folders walked into, the top of the Drive first */
  private path: Folder[] = [TOP_OF_DRIVE];
  private search = '';
  private searchTimer: number | undefined;
  /** the name last saved or opened, offered by the next save */
  private lastName = '';
  /** bumped on every render, so a listing that lands after the view moved on is dropped */
  private generation = 0;

  public constructor(private readonly dialog: HTMLDialogElement, private readonly designs: Designs, private readonly host: DesignDialogHost) {
    dialog.addEventListener('close', () => { window.clearTimeout(this.searchTimer); this.generation++; });
    // the save view shows the folder the app state names now, keeping a name being typed
    designs.onFolderChange(() => {
      if(!this.dialog.open || (this.view.kind !== 'save')) return/*nothing shows the folder*/;
      this.lastName = this.dialog.querySelector<HTMLInputElement>('#designName')?.value ?? this.lastName;
      this.renderSave();
    });
  }

  public get isOpen(): boolean { return this.dialog.open; }

  // == Open ======================================================================
  public openSave(): void { this.show({ kind: 'save' }); }

  public openOpen(): void {
    const folder = this.designs.getFolder();
    this.path = folder.id ? [TOP_OF_DRIVE, folder] : [TOP_OF_DRIVE];
    this.search = '';
    this.show({ kind: 'open' });
  }

  // == Views =====================================================================
  private show(view: View): void {
    this.view = view;
    this.generation++;
    if(view.kind === 'save') this.renderSave();
    else this.renderBrowser();
    if(!this.dialog.open) this.dialog.showModal();
  }

  // .. Save ......................................................................
  private renderSave(): void {
    const folder = this.designs.getFolder();
    const name = input('designName', 'text', 'Name', this.lastName);
    const message = paragraph('designs-message');
    const save = button('Save', 'designs-primary', 'submit');
    const changeFolder = button('Change folder', 'designs-link', 'button', () => { this.lastName = name.value; this.path = folder.id ? [TOP_OF_DRIVE, folder] : [TOP_OF_DRIVE]; this.search = ''; this.show({ kind: 'choose' }); });
    const cancel = button('Cancel', 'designs-secondary', 'button', () => this.dialog.close());
    const form = element('form', { className: 'designs-form' },
      heading('Save design'),
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
        const saved = await this.designs.save(name.value, replace);
        this.lastName = saved.name;
        save.textContent = 'Saved';
        message.className = 'designs-message is-done';
        message.textContent = saved.replaced ? `Replaced "${saved.name}" in ${saved.folder.name}.` : `Saved "${saved.name}" to ${saved.folder.name}.`;
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
    const choosing = (this.view.kind === 'choose');
    const here = this.path[this.path.length - 1];
    const list = element('ul', { className: 'designs-list', role: 'list' });
    const message = paragraph('designs-message');
    const searchBox = input('designSearch', 'search', 'Search folders by name', this.search);
    const back = button('Back', 'designs-link', 'button', () => { this.path = this.path.slice(0, -1); this.show(this.view); });
    back.hidden = (this.path.length < 2) || (this.search.length > 0);

    const footer = choosing
      ? actions(button('Cancel', 'designs-secondary', 'button', () => this.show({ kind: 'save' })),
          button('Use this folder', 'designs-primary', 'button', () => void this.run(message, [], async () => { await this.designs.setFolder(here); this.show({ kind: 'save' }); })))
      : actions(button('Cancel', 'designs-secondary', 'button', () => this.dialog.close()));

    this.dialog.replaceChildren(element('div', { className: 'designs-form' },
      heading(choosing ? 'Choose a folder' : 'Open design'),
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
    const generation = this.generation;
    const loading = element('li', { className: 'designs-note' }, 'Reading folders…');
    list.append(loading);
    try {
      const page = (this.search.length > 0)
        ? { ...(await this.designs.searchFolders(this.search, offset)), designs: [] as ReadonlyArray<Design>, read: 0 }
        : await this.designs.browse(here, offset);
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
        list.append(element('li', {}, row('design', displayName(design), () => this.confirmLoad(design))));
      }
      if(page.hasMore) {
        const more = button('More', 'designs-link', 'button', () => { more.parentElement?.remove(); void this.fill(list, message, here, withDesigns, offset + ((this.search.length > 0) ? page.folders.length : page.read)); });
        list.append(element('li', { className: 'designs-note' }, more));
      } /* else -- the whole folder is listed */
      if((offset === 0) && (list.childElementCount < 1)) {
        list.append(element('li', { className: 'designs-note' }, (this.search.length > 0) ? 'No folder matches that name.' : withDesigns ? 'No folders or designs here.' : 'No folders here.'));
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
      const folder = await this.designs.createFolder(here, name.value);
      this.path = [...this.path, folder];
      this.show(this.view);
    }));
    name.addEventListener('keydown', event => { if(event.key === 'Enter') { event.preventDefault(); create.click(); } });
    return element('div', { className: 'designs-new' }, label('New folder', name), create);
  }

  // .. Load ......................................................................
  /** loads a design, asking first when it would replace parts */
  private confirmLoad(design: Design): void {
    const name = displayName(design);
    const parts = this.host.partCount();
    if(parts < 1) { void this.load(design, paragraph('designs-message')); return; }

    const message = paragraph('designs-message');
    const replace = button('Replace', 'designs-primary', 'button', () => void this.load(design, message, replace));
    this.generation++;
    this.dialog.replaceChildren(element('div', { className: 'designs-form' },
      heading('Open design'),
      element('p', { className: 'designs-confirm' }, `Replace the current build (${parts} ${(parts === 1) ? 'part' : 'parts'}) with "${name}"?`),
      message,
      actions(button('Cancel', 'designs-secondary', 'button', () => this.show({ kind: 'open' })), replace)));
    replace.focus();
  }

  private async load(design: Design, message: HTMLElement, ...busy: HTMLButtonElement[]): Promise<void> {
    if(!message.isConnected) this.dialog.append(message);
    await this.run(message, busy, async () => {
      const name = await this.designs.load(design);
      this.lastName = name;
      this.dialog.close();
      this.host.onLoaded(name);
    });
  }

  // .. Util ......................................................................
  /** runs an action with its controls disabled, showing a refusal in the message;
   *  `handled` takes a refusal the caller answers itself. The controls come back on
   *  a refusal only: an action that lands moves the dialog on or closes it */
  private async run(message: HTMLElement, busy: ReadonlyArray<HTMLButtonElement | HTMLInputElement>, action: () => Promise<void>, handled?: (error: unknown) => boolean): Promise<void> {
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

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { role?: string; }, ...children: Child[]): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  const { role, ...rest } = props;
  Object.assign(node, rest);
  if(role) node.setAttribute('role', role);
  node.append(...children);
  return node;
};

const heading = (text: string) => element('h2', { className: 'designs-title' }, text);
const paragraph = (className: string) => { const node = element('p', { className }); node.setAttribute('role', 'status'); return node; };
const actions = (...buttons: HTMLButtonElement[]) => element('div', { className: 'designs-actions' }, ...buttons);
const label = (text: string, control: HTMLInputElement) => element('label', { className: 'designs-field' }, element('span', { className: 'designs-label' }, text), control);

const input = (id: string, type: string, placeholder: string, value: string): HTMLInputElement =>
  element('input', { id, type, placeholder, value, autocomplete: 'off', spellcheck: false, className: 'designs-input' });

const button = (text: string, className: string, type: 'button' | 'submit', onClick?: () => void): HTMLButtonElement => {
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
const showError = (message: HTMLElement, error: unknown): void => {
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
