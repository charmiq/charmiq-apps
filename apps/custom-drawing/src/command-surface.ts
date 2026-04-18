import { generateElementId, generateGroupId, getElementBounds, moveElementBy, type DrawingElement } from './element-model';
import { getDrawingBounds, rotatePoint } from './geometry';
import type { SelectionManager } from './selection-manager';
import type { SvgRenderer } from './svg-renderer';

// advertise drawing API to LLMs and other Applications
// ********************************************************************************
interface Charmiq {
  advertise?: (channel: string, handlers: Record<string, (...args: any[]) => any>) => void;
}

// == CommandSurface ==============================================================
export class CommandSurface {
  private readonly renderer: SvgRenderer;
  private readonly selection: SelectionManager;

  public elements: DrawingElement[] = [];
  public onSave: (() => void) | null = null;

  public constructor(renderer: SvgRenderer, selection: SelectionManager) {
    this.renderer = renderer;
    this.selection = selection;
  }

  // ------------------------------------------------------------------------------
  public init(charmiq: Charmiq): void {
    if(!charmiq.advertise) {
      console.warn('advertise not available — drawing capabilities not exposed');
      return;
    } /* else -- CharmIQ exists as expected */

    charmiq.advertise('charmiq.command', {
      getElements: () => [...this.elements],

      addElement: (spec: any) => {
        const el: any = { id: generateElementId(), ...spec };
        if((el.width !== undefined) && (el.height !== undefined)) {
          el.x2 = el.x + el.width;
          el.y2 = el.y + el.height;
        } /* else -- not a shape with width/height */
        this.elements.push(el);
        this.renderer.renderElement(el);
        this.onSave?.();
        return el.id;
      },

      addElements: (specs: any[]) => {
        const newEls = specs.map((s: any) => {
          const el: any = { id: generateElementId(), ...s };
          if((el.width !== undefined) && (el.height !== undefined)) { el.x2 = el.x + el.width; el.y2 = el.y + el.height; }
          return el;
        });
        this.elements.push(...newEls);
        for(const el of newEls) this.renderer.renderElement(el);
        this.onSave?.();
        return newEls.map(e => e.id);
      },

      move: (targets: string | string[], deltaX: number, deltaY: number) => {
        const elements = this.resolveTargets(targets);
        const positions: { id: string; bounds: ReturnType<typeof getElementBounds> }[] = [];
        for(const el of elements) {
          moveElementBy(el, deltaX, deltaY);
          positions.push({ id: el.id, bounds: getElementBounds(el) });
        }
        this.renderer.rerenderAll(this.elements);
        this.onSave?.();
        return positions;
      },

      rotate: (targets: any, angle: number) => {
        const els = this.resolveTargets(targets);
        if(els.length === 1) {
          els[0].angle = angle;
        } else {
          const bounds = getDrawingBounds(els);
          const cx = bounds.minX + (bounds.maxX - bounds.minX) / 2;
          const cy = bounds.minY + (bounds.maxY - bounds.minY) / 2;
          for(const el of els) {
            const orig = el.angle || 0;
            const b = getElementBounds(el);
            const eCx = b.x + b.width / 2;
            const eCy = b.y + b.height / 2;
            const delta = angle - orig;
            const r = rotatePoint(eCx, eCy, cx, cy, delta);
            const dx = r.x - eCx;
            const dy = r.y - eCy;
            moveElementBy(el, dx, dy);
            el.angle = angle;
          }
        }
        this.renderer.rerenderAll(this.elements);
        this.onSave?.();
        return angle;
      },

      delete: (targets: string | string[]) => {
        const els = this.resolveTargets(targets);
        const ids = new Set(els.map(e => e.id));
        // mutate in place so the shared elements array reference stays valid across modules
        for(let i=this.elements.length - 1; i>=0; i--) {
          if(ids.has(this.elements[i].id)) this.elements.splice(i, 1);
        }
        this.renderer.rerenderAll(this.elements);
        this.onSave?.();
        return [...ids];
      },

      group: (targets: string | string[]) => {
        const els = this.resolveTargets(targets);
        if(els.length <= 1) throw new Error('At least 2 elements are required');
        const gid = generateGroupId();
        for(const el of els) el.groupId = gid;
        this.renderer.rerenderAll(this.elements);
        this.onSave?.();
        return gid;
      },

      ungroup: (groupId: string) => {
        const grouped = this.elements.filter(e => e.groupId === groupId);
        if(grouped.length < 1) throw new Error(`No elements found with groupId ${groupId}`);
        for(const el of grouped) delete el.groupId;
        this.renderer.rerenderAll(this.elements);
        this.onSave?.();
        return grouped.map(e => e.id);
      },

      clear: () => {
        this.elements.length = 0;
        this.selection.deselectAll();
        this.renderer.rerenderAll(this.elements);
        this.onSave?.();
        return true;
      },
    });
  }

  // ==============================================================================
  private resolveTargets(targets: string | string[]): DrawingElement[] {
    const arr = Array.isArray(targets) ? targets : [targets];
    const result: DrawingElement[] = [];
    const seen = new Set<string>();

    for(const target of arr) {
      if((typeof target === 'string') && target.startsWith('group_')) {
        const group = this.elements.filter(e => e.groupId === target);
        if(group.length < 1) throw new Error(`No elements found with groupId ${target}`);
        for(const e of group) { if(!seen.has(e.id)) { result.push(e); seen.add(e.id); } }
      } else {
        const el = this.elements.find(e => e.id === target);
        if(!el) throw new Error(`Element with id ${target} not found`);
        if(!seen.has(el.id)) { result.push(el); seen.add(el.id); }
      }
    }
    return result;
  }
}
