import { MAX_RUN_LENGTH } from './simulator';

// a row of cells, one per H in the run, each labeled "H". Bespoke SVG
// ********************************************************************************
const SVG_NS    = 'http://www.w3.org/2000/svg';
const BOX_W     = 22;
const BOX_H     = 23;
const PAD       = 1;

// == RunVector ===================================================================
export class RunVector {
  private readonly svg: SVGSVGElement;
  private readonly cellsG: SVGGElement;
  private readonly textsG: SVGGElement;

  public constructor(parent: HTMLElement, className: string) {
    const wrap = document.createElement('div');
    wrap.className = `run-vector ${className}`;
    parent.appendChild(wrap);

    this.svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('width',  String(BOX_W * MAX_RUN_LENGTH + 2 * PAD));
    this.svg.setAttribute('height', String(BOX_H + 2 * PAD));
    wrap.appendChild(this.svg);

    this.cellsG = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    this.cellsG.setAttribute('transform', `translate(${PAD}, ${PAD})`);
    this.svg.appendChild(this.cellsG);

    this.textsG = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    this.textsG.setAttribute('transform', `translate(${PAD + 6}, ${BOX_H - 4})`);
    this.svg.appendChild(this.textsG);
  }

  // ==============================================================================
  /** redraw to show exactly `length` H cells. Caller already clamps to
   *  MAX_RUN_LENGTH; we clamp again defensively to keep the SVG bounded */
  public update(length: number): void {
    const n = Math.max(0, Math.min(MAX_RUN_LENGTH, length));

    // additive: extend if we've grown, prune if we've shrunk -- avoids the
    // full-redraw flicker the original sketch's d3 enter/exit pattern had
    while(this.cellsG.childElementCount < n) {
      const i = this.cellsG.childElementCount;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class',  'run-vector-cell');
      rect.setAttribute('x',      String(i * BOX_W));
      rect.setAttribute('y',      '0');
      rect.setAttribute('width',  String(BOX_W));
      rect.setAttribute('height', String(BOX_H));
      this.cellsG.appendChild(rect);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'run-vector-cell-text');
      text.setAttribute('x',     String(i * BOX_W));
      text.textContent = 'H';
      this.textsG.appendChild(text);
    }
    while(this.cellsG.childElementCount > n) {
      this.cellsG.lastChild!.remove();
      this.textsG.lastChild!.remove();
    }
  }
}
