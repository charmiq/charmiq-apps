import diff from 'fast-diff';

// converts fast-diff output to CharmIQ-compatible OT change objects
// ********************************************************************************
// == Constants ===================================================================
/** diff type constants from fast-diff */
const DIFF_EQUAL = 0;
const DIFF_DELETE = -1;
const DIFF_INSERT = 1;

// == Types =======================================================================
/** a single OT-compatible change */
export interface OtChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

// == Class =======================================================================
/** converts fast-diff output into OT changes, consolidating when too many */
export class DiffConverter {
  private readonly maxChangesLimit: number;

  public constructor(maxChangesLimit = 5) {
    this.maxChangesLimit = maxChangesLimit;
  }

  /** compute OT changes between two strings */
  public convert(oldText: string, newText: string): ReadonlyArray<OtChange> {
    const diffs = diff(oldText, newText);
    const { changes, totalOffset } = this.computeChanges(diffs);

    if(changes.length < 1) return [];

    if(changes.length > this.maxChangesLimit) {
      const consolidated = this.consolidateChanges(diffs, newText, totalOffset);
      return [consolidated];
    } /* else -- within limit */

    return changes;
  }

  // == Internal ==================================================================
  /** walk diffs and produce individual changes */
  private computeChanges(diffs: ReadonlyArray<[number, string]>): Readonly<{ changes: OtChange[]; totalOffset: number }> {
    const changes: OtChange[] = [];
    let currentIndex = 0;/*position in the original string*/
    let offset = 0;/*cumulative shift caused by previous changes*/

    for(let i=0; i<diffs.length; i++) {
      const [type, text] = diffs[i];

      switch(type) {
        case DIFF_EQUAL:
          currentIndex += text.length;
          break;

        case DIFF_DELETE:
          if(this.isNextInsert(diffs, i)) {
            // replacement — delete+insert pair
            const insertText = diffs[i + 1][1];
            changes.push({ from: currentIndex + offset, to: currentIndex + text.length + offset, insert: insertText });
            currentIndex += text.length;
            offset += (insertText.length - text.length);
            i++;/*skip paired insert*/
          } else {
            // pure deletion
            changes.push({ from: currentIndex + offset, to: currentIndex + text.length + offset, insert: '' });
            currentIndex += text.length;
            offset -= text.length;
          }
          break;

        case DIFF_INSERT:
          // pure insertion (not paired with a delete)
          changes.push({ from: currentIndex + offset, to: currentIndex + offset, insert: text });
          offset += text.length;
          break;
      }
    }

    return { changes, totalOffset: offset };
  }

  // ................................................................................
  /** collapse many changes into a single replacement spanning the full range */
  private consolidateChanges(diffs: ReadonlyArray<[number, string]>, newText: string, totalOffset: number): OtChange {
    const { minFrom, maxTo } = this.findChangeRange(diffs);

    const newLength = (maxTo - minFrom) + totalOffset;
    const insert = newText.substring(minFrom, minFrom + newLength);

    return { from: minFrom, to: maxTo, insert };
  }

  // ................................................................................
  /** find the range in the original document that encompasses all changes */
  private findChangeRange(diffs: ReadonlyArray<[number, string]>): Readonly<{ minFrom: number; maxTo: number }> {
    let minFrom = Infinity;
    let maxTo = -Infinity;
    let idx = 0;

    for(let i=0; i<diffs.length; i++) {
      const [type, text] = diffs[i];

      switch(type) {
        case DIFF_EQUAL:
          idx += text.length;
          break;

        case DIFF_DELETE:
          minFrom = Math.min(minFrom, idx);
          maxTo = Math.max(maxTo, idx + text.length);
          idx += text.length;
          if(this.isNextInsert(diffs, i)) i++;/*skip paired insert*/
          break;

        case DIFF_INSERT:
          minFrom = Math.min(minFrom, idx);
          maxTo = Math.max(maxTo, idx);
          break;
      }
    }

    return { minFrom, maxTo };
  }

  // ................................................................................
  /** check if the next diff entry is an insert */
  private isNextInsert(diffs: ReadonlyArray<[number, string]>, currentIndex: number): boolean {
    return (currentIndex + 1 < diffs.length) && (diffs[currentIndex + 1][0] === DIFF_INSERT);
  }
}
