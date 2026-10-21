import type { DocumentState } from '../../brick-shared/app-state';
import { DesignStore, displayName } from '../../brick-shared/designs';
import type { Design, Drive } from '../../brick-shared/drive';

import { isReservedName, type Build } from './build';

// the build saved as a design in the Drive and a design loaded back, whole or as a
// component of the build: the family's design store (SEE: brick-shared/designs.ts)
// over the build's text, and the names a design's component takes
// ********************************************************************************
// == Constants ===================================================================
/** the longest a component's name is (SEE: Build#defineComponent) */
const MAX_COMPONENT_NAME = 40/*characters*/;
/** what a design's component name takes when the build reserves its words */
const RESERVED_SUFFIX = '-design';

// == Class =======================================================================
export class Designs extends DesignStore {
  public constructor(drive: Drive, private readonly build: Build, documentState: DocumentState) {
    super(drive, documentState, { noun: 'design', listing: 'listDesigns' });
  }

  // == Save & Load ===============================================================
  /** saves the build as a design in the folder. A design of that name already there
   *  is refused (DesignExists) unless `replace` says to write over it */
  public save(name: string, replace: boolean) {
    return this.write(name, replace, async () => { await this.build.whenReady(); return this.build.getText()/*refused for a build read only in part*/; });
  }

  /** replaces the build with a saved design: one found in the Drive, or the one of
   *  that name in the folder */
  public async load(design: Design | string): Promise<string/*the design's name*/> {
    const { design: found, text } = await this.read(design);
    await this.build.replace(text);
    return displayName(found);
  }

  /** defines a component from a saved design (one found in the Drive, or the one of
   *  that name in the folder), named `name` or after the design (SEE:
   *  componentName); a component of that name already in the build is redefined,
   *  every copy with it */
  public async asComponent(design: Design | string, name?: string) {
    const { design: found, text } = await this.read(design);
    return this.build.defineComponentFromText(name ?? componentName(displayName(found)), text);
  }

  /** brings a design into the build in one edit: defined as a component named after
   *  it (SEE: componentName), one copy placed on the ground beside the build. A
   *  component of that name placed already is updated, every copy with it, only when
   *  `replace` says it may be (ComponentPlaced otherwise) */
  public async addToBuild(design: Design, replace = false) {
    return this.build.addDesign(componentName(displayName(design)), (await this.read(design)).text, replace);
  }
}

// == Util ========================================================================
/** the component a design's name makes: lower case words joined by dashes, starting
 *  with a letter (`Beach house` is `beach-house`), at most 40 characters, and never a
 *  name the build reserves (`Model` is `model-design`) */
export const componentName = (designName: string): string => {
  const words = designName.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, ''/*an accent apart from its letter*/).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = clip(/^[a-z]/.test(words) ? words : `design-${words}`, MAX_COMPONENT_NAME);
  return isReservedName(name) ? `${clip(name, MAX_COMPONENT_NAME - RESERVED_SUFFIX.length)}${RESERVED_SUFFIX}` : name;
};

/** a dashed name cut to at most `length` characters, never ending in a dash */
const clip = (name: string, length: number): string => name.slice(0, length).replace(/-+$/, '');
