import { button, paragraph, showError, DesignDialog } from './design-dialog';
import { DesignError, type DesignStore, type Saved } from './designs';
import type { DriveFile } from './drive';

// the dialog that picks one of the person's files for the app (a sound for the film, a
// picture for the sky): the family's open list (SEE: design-dialog.ts) walking the
// Drive's folders for the files its store lists, the file picked handed to the app.
// The files are the person's own in the Platform, however they came there
// ********************************************************************************
// == Class =======================================================================
export class PickDialog extends DesignDialog {
  /** `store` lists the files picked from (SEE: drive.ts FileKind); `onPick` uses the
   *  file picked, a refusal shown in the dialog under `refused` */
  public constructor(dialog: HTMLDialogElement, store: DesignStore, private readonly onPick: (file: DriveFile) => Promise<void>, private readonly refused: string/*e.g. "The sound was not added"*/) {
    super(dialog, store);
  }

  /** opens the list of folders and their files */
  public open(): void { this.openOpen(); }

  // == The App's =================================================================
  protected save(): Promise<Saved> { return Promise.reject(new DesignError(`A ${this.store.words.noun} is picked, never saved here.`))/*the dialog offers no save*/; }

  protected async choose(file: DriveFile): Promise<void> {
    try {
      await this.onPick(file);
      this.dialog.close();
    } catch(error) {
      // the refusal shown, and the way back to the list
      const message = paragraph('designs-message');
      showError(message, error);
      const back = button('Back', 'designs-primary', 'button', () => this.reopen());
      this.showForm(this.refused, undefined, message, [button('Close', 'designs-secondary', 'button', () => this.dialog.close()), back], back);
    }
  }
}
