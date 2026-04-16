import { of } from 'rxjs';
import { map, distinctUntilChanged, catchError } from 'rxjs/operators';

import type { DrawingElement } from './element-model';

// reactive state sync with appState (rxjs)
// ********************************************************************************
interface AppState {
  appState: {
    subscribe: (observer: any) => any;
    set: (value: any) => void;
    get$: () => any;
  };
}

// == StateBridge =================================================================
export class StateBridge {
  private readonly appState: AppState['appState'];
  private isReceivingExternalUpdate = false;

  public onElementsChanged: ((elements: DrawingElement[]) => void) | null = null;

  public constructor(appState: AppState['appState']) {
    this.appState = appState;
  }

  // -- setup reactive subscription -----------------------------------------------
  public init(): void {
    this.appState.get$()
      .pipe(
        map((state: any) => {
          if(!state || Object.keys(state).length < 1) {
            const def = { elements: [], lastUpdated: new Date().toISOString() };
            setTimeout(() => this.saveState(def), 100);
            return def;
          }
          return state;
        }),
        distinctUntilChanged((prev: any, curr: any) => JSON.stringify(prev) === JSON.stringify(curr)),
        catchError((err: any) => {
          console.error('State subscription error:', err);
          return of({ elements: [] });
        }),
      )
      .subscribe((state: any) => {
        // transform state to fix common LLM mistakes
        const transformed = this.transformState(state);

        this.isReceivingExternalUpdate = true;
        this.onElementsChanged?.(transformed.elements || []);

        setTimeout(() => { this.isReceivingExternalUpdate = false; }, 100);
      });
  }

  // -- save (outgoing) -----------------------------------------------------------
  public saveState(newState: any): void {
    if(this.isReceivingExternalUpdate) return;
    this.appState.set({ ...newState, lastUpdated: new Date().toISOString() });
  }

  public save(elements: DrawingElement[]): void {
    this.saveState({ elements });
  }

  public get isReceiving(): boolean { return this.isReceivingExternalUpdate; }

  // -- transform (incoming) state to fix known issues ----------------------------
  private transformState(state: any): any {
    if(!state?.elements || !Array.isArray(state.elements)) return state;

    const elements = state.elements.map((el: any) => {
      // fix line elements that use x1/y1 instead of x/y
      if((el.type === 'line') && ('x1' in el) && ('y1' in el)) {
        const t = { ...el };
        if(!('x' in t) || !('y' in t)) { t.x = el.x1; t.y = el.y1; }
        delete t.x1; delete t.y1;
        return t;
      } /* else -- not a line with x1/y1 */
      return el;
    });

    return { ...state, elements };
  }
}
