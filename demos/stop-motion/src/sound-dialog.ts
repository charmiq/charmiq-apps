import { button, paragraph, showError, DesignDialog } from '../../brick-shared/design-dialog';
import { DesignError, type DesignStore, type Saved } from '../../brick-shared/designs';
import type { DriveFile } from '../../brick-shared/drive';

// the dialog that adds a sound to the film: the family's open list (SEE:
// brick-shared/design-dialog.ts) walking the Drive's folders for audio files, a file
// picked handed to the timeline, which plays it from the playhead. the sounds are the
// person's own files in the Platform, however they came there
// ********************************************************************************
// == Class =======================================================================
export class SoundDialog extends DesignDialog {
  /** `store` lists audio files (SEE: brick-shared/drive.ts SOUND_FILES); `onPick` adds
   *  the file picked, its refusal shown in the dialog */
  public constructor(dialog: HTMLDialogElement, store: DesignStore, private readonly onPick: (file: DriveFile) => Promise<void>) {
    super(dialog, store);
  }

  /** opens the list of folders and their sounds */
  public open(): void { this.openOpen(); }

  // == The App's =================================================================
  protected save(): Promise<Saved> { return Promise.reject(new DesignError('A sound is added, never saved here.'))/*the dialog offers no save*/; }

  protected async choose(file: DriveFile): Promise<void> {
    try {
      await this.onPick(file);
      this.dialog.close();
    } catch(error) {
      // the refusal shown, and the way back to the list
      const message = paragraph('designs-message');
      showError(message, error);
      const back = button('Back', 'designs-primary', 'button', () => this.reopen());
      this.showForm('The sound was not added', undefined, message, [button('Close', 'designs-secondary', 'button', () => this.dialog.close()), back], back);
    }
  }
}
