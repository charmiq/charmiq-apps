import { DesignDialog as FamilyDialog, button, paragraph } from '../../brick-shared/design-dialog';
import { displayName } from '../../brick-shared/designs';
import type { Design } from '../../brick-shared/drive';

import { ComponentPlaced } from './build';
import type { Designs } from './designs';

// the studio's save and open dialog over the family's (SEE: brick-shared/design-dialog.ts):
// a save writes the build; a design picked opens into an empty build, and into a
// build with parts is added as a component beside them or replaces them, asked first.
// Adding a design whose component the build places already asks before updating
// every copy
// ********************************************************************************
// == Types =======================================================================
/** what the dialog asks of the studio */
export type DesignDialogHost = Readonly<{
  /** how many parts the build holds (a load that would replace them asks first) */
  partCount: () => number;
  /** a design has replaced the build */
  onLoaded: (name: string) => void;
  /** a design has been added to the build as a component, one copy beside it */
  onAdded: (component: string) => void;
}>;

// == Class =======================================================================
export class DesignDialog extends FamilyDialog {
  public constructor(dialog: HTMLDialogElement, private readonly designs: Designs, private readonly host: DesignDialogHost) {
    super(dialog, designs);
  }

  protected save(name: string, replace: boolean) { return this.designs.save(name, replace); }

  // .. Load ......................................................................
  /** a design picked: an empty build opens it; a build with parts takes it as a
   *  component beside them, or is replaced by it */
  protected choose(design: Design): Promise<void> | void {
    const name = displayName(design);
    const parts = this.host.partCount();
    if(parts < 1) return this.load(design, paragraph('designs-message'))/*the row says it opens until it has*/;

    const message = paragraph('designs-message');
    const replace = button('Replace', 'designs-secondary', 'button', () => void this.load(design, message, add, replace));
    const add = button('Add to this build', 'designs-primary', 'button', () => void this.add(design, false, message, add, replace));
    this.showForm('Open design', `Add "${name}" to this build, or replace the build (${parts} ${(parts === 1) ? 'part' : 'parts'}) with it?`, message,
      [button('Cancel', 'designs-secondary', 'button', () => this.reopen()), replace, add], add);
  }

  /** adds a design to the build. One whose component the build places already is
   *  refused unless `replace` says to update every copy to the design, and the
   *  refusal asks (SEE: confirmUpdate) */
  private async add(design: Design, replace: boolean, message: HTMLElement, ...busy: HTMLButtonElement[]): Promise<void> {
    if(!message.isConnected) this.dialog.append(message);
    await this.run(message, busy, async () => {
      const { component } = await this.designs.addToBuild(design, replace);
      this.host.onAdded(component.name);
      if(component.leftOut < 1) { this.dialog.close(); return; }
      // the parts the build could not take, said before the dialog goes
      const done = button('Done', 'designs-primary', 'button', () => this.dialog.close());
      this.showForm('Add design', `Added "${component.name}". ${component.leftOut} ${(component.leftOut === 1) ? 'part' : 'parts'} of the design ${(component.leftOut === 1) ? 'is' : 'are'} off the grid and ${(component.leftOut === 1) ? 'was' : 'were'} left out.`, paragraph('designs-message'), [done], done);
    }, error => {
      if(!(error instanceof ComponentPlaced)) return false;
      this.confirmUpdate(design, error);
      return true;
    });
  }

  /** asks before an add that changes every copy of a component placed already */
  private confirmUpdate(design: Design, placed: ComponentPlaced): void {
    const { component, copies } = placed;
    const update = button('Update and add', 'designs-primary', 'button', () => void this.add(design, true, again, update));
    const again = paragraph('designs-message');
    this.showForm('Add design', `"${component}" is already in this build (${copies} ${(copies === 1) ? 'copy' : 'copies'}). Update ${(copies === 1) ? 'it' : 'them'} to this design and add another?`, again,
      [button('Cancel', 'designs-secondary', 'button', () => this.choose(design)), update], update);
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
}
