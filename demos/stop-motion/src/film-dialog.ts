import { button, DesignDialog, paragraph, showError } from '../../brick-shared/design-dialog';
import { displayName } from '../../brick-shared/designs';
import type { Design } from '../../brick-shared/drive';

import { UnsavedChanges, type Films } from './films';

// the film's save and open dialog over the family's (SEE: brick-shared/design-dialog.ts):
// a save writes the film (its set and its scene) under the name given; a film picked
// opens into the studio and the code block. Opening a film and starting a new one are
// tried without losing anything; the film's refusal over unsaved changes (read as it
// stands, last before it changes) asks, and only a yes discards them
// ********************************************************************************
// == Types =======================================================================
/** what the dialog tells the timeline */
export type FilmDialogHost = Readonly<{
  /** a film was opened: its name, and whether it carried a scene (a plain design's set
   *  alone did not) */
  onOpened: (name: string, scene: boolean) => void;
}>;

// == Class =======================================================================
export class FilmDialog extends DesignDialog {
  public constructor(dialog: HTMLDialogElement, private readonly films: Films, private readonly host: FilmDialogHost) {
    super(dialog, films.store);
  }

  /** asks for a name and saves the film under it, `suggested` offered */
  public saveAs(suggested: string): void {
    this.lastName = suggested;
    this.openSave();
  }

  /** starts a new film, asking first when that would lose unsaved changes */
  public async openNew(): Promise<void> {
    try {
      await this.films.clear();
    } catch(error) {
      if(error instanceof UnsavedChanges) { this.confirmNew(); return; }
      const message = paragraph('designs-message');
      showError(message, error);
      this.showForm('New film', undefined, message, [button('Close', 'designs-secondary', 'button', () => this.dialog.close())]);
    }
  }

  protected save(name: string, replace: boolean) { return this.films.save(name, replace); }

  /** a film picked: opened, asking first when that would lose unsaved changes */
  protected choose(design: Design): Promise<void> { return this.open(design, false, paragraph('designs-message')); }

  // == Internal ==================================================================
  /** opens a film, losing unsaved changes only when `discard` (the person said yes) */
  private async open(design: Design, discard: boolean, message: HTMLElement, ...busy: HTMLButtonElement[]): Promise<void> {
    if(!message.isConnected) this.dialog.append(message);
    await this.run(message, busy, async () => {
      const opened = await this.films.open(design, discard);
      this.lastName = opened.name;
      this.dialog.close();
      this.host.onOpened(opened.name, opened.scene);
    }, error => {
      if(discard || !(error instanceof UnsavedChanges)) return false;
      this.confirmOpen(design);
      return true;
    });
  }

  /** asks before an open loses unsaved changes */
  private confirmOpen(design: Design): void {
    const message = paragraph('designs-message');
    const open = button('Open', 'designs-primary', 'button', () => void this.open(design, true, message, open));
    this.showForm('Open film', `Open "${displayName(design)}"? ${this.unsavedChanges()} are lost.`, message, [button('Cancel', 'designs-secondary', 'button', () => this.reopen()), open], open);
  }

  /** asks before a new film loses unsaved changes */
  private confirmNew(): void {
    const message = paragraph('designs-message');
    const clear = button('New film', 'designs-primary', 'button', () => void this.run(message, [clear], async () => { await this.films.clear(true); this.dialog.close(); }));
    this.showForm('New film', `Clear the set and the scene? ${this.unsavedChanges()} are lost.`, message, [button('Cancel', 'designs-secondary', 'button', () => this.dialog.close()), clear], clear);
  }

  /** what the film's unsaved changes are called */
  private unsavedChanges(): string {
    const name = this.films.state.name;
    return (name !== undefined) ? `The changes to "${name}"` : 'The film\'s unsaved changes';
  }
}
