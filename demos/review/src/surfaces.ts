import type { Subscription } from 'rxjs';

import type { CharmIQAPI } from '../../../shared/charmiq';
import { REVIEW_SURFACE, type Mark, type ReviewSurface } from '../../../shared/review/surface';

// the document's surfaces: every Application advertising the review capability (Brick
// Studio's picture, Stop Motion's timeline), found by discovery and followed as they
// come and go. While a note is written each surface takes marks and every mark it makes
// reaches the note's draft; showing a note sends its marks to every surface, each
// drawing its own and going to the moments they name. A surface found while marking
// starts marking at once; one gone drops out
// ********************************************************************************
export class Surfaces {
  private surfaces: ReadonlyArray<ReviewSurface> = [];
  private readonly heard = new Map<ReviewSurface, Subscription>();
  private marking = false;
  private markMade: (mark: Mark) => void = () => undefined;
  private found: (count: number) => void = () => undefined;

  public constructor(charmiq: CharmIQAPI | undefined) {
    if(!charmiq?.discover$) return/*standalone: no surfaces*/;
    charmiq.discover$<ReviewSurface>(REVIEW_SURFACE).subscribe({
      next: surfaces => this.arrange(surfaces),
      error: () => this.arrange([])/*refused: nothing to mark*/,
    });
  }

  /** told each mark a surface makes while marking */
  public onMark(callback: (mark: Mark) => void): void { this.markMade = callback; }
  /** told how many surfaces the document holds, each time that changes */
  public onFound(callback: (count: number) => void): void { this.found = callback; this.found(this.surfaces.length); }
  public count(): number { return this.surfaces.length; }

  /** every surface takes marks (on) or stops (off) */
  public mark(on: boolean): void {
    this.marking = on;
    for(const surface of this.surfaces) this.markOn(surface, on);
  }

  /** every surface shows these marks; none clears them */
  public show(marks: ReadonlyArray<Mark>): Promise<void> {
    return Promise.allSettled(this.surfaces.map(surface => surface.show(marks))).then(() => undefined);
  }

  // == Internal ==================================================================
  private arrange(surfaces: ReadonlyArray<ReviewSurface>): void {
    for(const [surface, subscription] of this.heard) if(!surfaces.includes(surface)) { subscription.unsubscribe(); this.heard.delete(surface); }
    const added = surfaces.filter(surface => !this.surfaces.includes(surface));
    this.surfaces = surfaces;
    if(this.marking) for(const surface of added) this.markOn(surface, true);
    this.found(this.surfaces.length);
  }

  private markOn(surface: ReviewSurface, on: boolean): void {
    if(on && !this.heard.has(surface)) this.heard.set(surface, surface.marks$().subscribe({ next: mark => { if(this.marking) this.markMade(mark); }, error: () => this.heard.delete(surface) }));
    if(!on) { this.heard.get(surface)?.unsubscribe(); this.heard.delete(surface); }
    surface.marking(on).catch(() => undefined/*a surface gone meanwhile*/);
  }
}
