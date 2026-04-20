// small two-series SVG histogram with optional overlaid mean lines. Same
// geometry as the single-trial sim's histogram; adds a `means` parameter to
// `redraw()` that renders a vertical line per mean at the appropriate x on
// the bucket scale.
//
// duplicated from the coin-flip sim pending the shared-kit extraction milestone
// -- having two callers will tell the extracted shape what it actually needs
// ********************************************************************************
const SVG_NS = 'http://www.w3.org/2000/svg';

// == Geometry ====================================================================
type Margin = Readonly<{ top: number; right: number; bottom: number; left: number; }>;

const DEFAULT_MARGIN: Margin = { top: 26, right: 12, bottom: 30, left: 30 };
const BAR_WIDTH      = 11;

// == Types =======================================================================
export type HistogramOptions = Readonly<{
  /** outer width including margins */
  width: number;
  /** outer height including margins */
  height: number;
  /** title shown above the chart */
  title: string;
  /** x-axis label shown below the chart */
  xAxisLabel: string;
  /** className applied to the empirical (filled) series -- sets the fill color
   *  via CSS so the palette lives in the stylesheet, not here */
  actualClassName: string;
  /** className applied to the theoretical (outlined) series. Same rationale */
  theoreticalClassName: string;
}>;

/** an overlaid vertical line at a particular x-bucket value. Typically used to
 *  mark an aggregate statistic (arithmetic mean, geometric mean, etc.) over
 *  the underlying distribution */
export type MeanOverlay = Readonly<{
  /** x-bucket value to place the line at. For a bucket axis labeled 1..N the
   *  value 3.5 lands halfway between buckets 3 and 4. Values outside [0.5, N+0.5]
   *  are clamped */
  value: number;
  /** className applied to the line -- stroke color lives in CSS */
  className: string;
}>;

// == Histogram ===================================================================
export class Histogram {
  private readonly svg: SVGSVGElement;
  private readonly actualG:      SVGGElement;
  private readonly theoreticalG: SVGGElement;
  private readonly meansG:       SVGGElement;
  private readonly textG:        SVGGElement;
  private readonly xAxisG:       SVGGElement;
  private readonly yAxisG:       SVGGElement;

  private readonly margin = DEFAULT_MARGIN;
  private readonly innerW: number;
  private readonly innerH: number;

  public constructor(parent: HTMLElement, opts: HistogramOptions) {
    const wrap = document.createElement('div');
    wrap.className = 'histogram';
    parent.appendChild(wrap);

    this.svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('width',  String(opts.width));
    this.svg.setAttribute('height', String(opts.height));
    wrap.appendChild(this.svg);

    this.innerW = opts.width  - this.margin.left - this.margin.right;
    this.innerH = opts.height - this.margin.top  - this.margin.bottom;

    // .. title ...................................................................
    const titleText = document.createElementNS(SVG_NS, 'text');
    titleText.setAttribute('class', 'histogram-title');
    titleText.setAttribute('x', String(this.margin.left));
    titleText.setAttribute('y', String(this.margin.top - 12));
    titleText.textContent = opts.title;
    this.svg.appendChild(titleText);

    // .. data layers .............................................................
    // theoretical first so empirical bars sit in front; means on top so they
    // never get obscured
    this.theoreticalG = this.appendG(opts.theoreticalClassName);
    this.actualG      = this.appendG(opts.actualClassName);
    this.textG        = this.appendG('histogram-bar-text');
    this.meansG       = this.appendG('histogram-means');

    // .. axes ....................................................................
    this.xAxisG = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    this.xAxisG.setAttribute('class', 'histogram-axis x');
    this.xAxisG.setAttribute('transform',
      `translate(${this.margin.left}, ${this.margin.top + this.innerH})`);
    this.svg.appendChild(this.xAxisG);

    this.yAxisG = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    this.yAxisG.setAttribute('class', 'histogram-axis y');
    this.yAxisG.setAttribute('transform',
      `translate(${this.margin.left}, ${this.margin.top})`);
    this.svg.appendChild(this.yAxisG);

    // x-axis label (static) -- centered under the plot area
    const xLabel = document.createElementNS(SVG_NS, 'text');
    xLabel.setAttribute('class', 'histogram-axis-label');
    xLabel.setAttribute('x', String(this.margin.left + this.innerW / 2));
    xLabel.setAttribute('y', String(this.margin.top + this.innerH + 24));
    xLabel.setAttribute('text-anchor', 'middle');
    xLabel.textContent = opts.xAxisLabel;
    this.svg.appendChild(xLabel);
  }

  // == Drawing ===================================================================
  /** redraw both series plus optional mean overlays. `actual` and `theoretical`
   *  must be the same length (= number of buckets). The y-axis autoscales to
   *  a "nice" upper bound */
  public redraw(
    actual:      readonly number[],
    theoretical: readonly number[],
    means:       readonly MeanOverlay[] = [],
  ): void {
    const buckets = actual.length/*assumed === theoretical.length*/;
    const xStep   = this.innerW / buckets;

    const rawMax  = Math.max(1, ...actual, ...theoretical);
    const yMax    = niceCeil(rawMax);

    const yScale  = (v: number) => this.innerH * (1 - v / yMax);
    const yHeight = (v: number) => this.innerH * (v / yMax);
    const xCenter = (i: number) => i * xStep + xStep / 2;
    // map a continuous bucket value (1..N) to a pixel x
    const xContinuous = (v: number) => {
      const clamped = Math.max(0.5, Math.min(buckets + 0.5, v));
      return (clamped - 0.5) * xStep + xStep / 2;
    };

    this.drawBars(this.actualG,      actual,      xCenter, yScale, yHeight);
    this.drawBars(this.theoreticalG, theoretical, xCenter, yScale, yHeight);
    this.drawBarLabels(actual, xCenter, yScale);
    this.drawMeans(means, xContinuous);
    this.drawXAxis(buckets, xCenter);
    this.drawYAxis(yMax);
  }

  // ==============================================================================
  // -- Drawing -------------------------------------------------------------------
  private drawBars(
    layer: SVGGElement,
    data: readonly number[],
    xCenter: (i: number) => number,
    yScale:  (v: number) => number,
    yHeight: (v: number) => number,
  ): void {
    while(layer.childElementCount < data.length) {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('class', 'histogram-bar');
      r.setAttribute('width', String(BAR_WIDTH));
      layer.appendChild(r);
    }
    while(layer.childElementCount > data.length) layer.lastChild!.remove();

    data.forEach((v, i) => {
      const r = layer.children[i] as SVGRectElement;
      r.setAttribute('x',      String(xCenter(i) - BAR_WIDTH / 2));
      r.setAttribute('y',      String(yScale(v)));
      r.setAttribute('height', String(Math.max(0, yHeight(v))));
    });
  }

  private drawBarLabels(
    data: readonly number[],
    xCenter: (i: number) => number,
    yScale:  (v: number) => number,
  ): void {
    while(this.textG.childElementCount < data.length) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('class', 'histogram-bar-label');
      t.setAttribute('text-anchor', 'middle');
      this.textG.appendChild(t);
    }
    while(this.textG.childElementCount > data.length) this.textG.lastChild!.remove();

    data.forEach((v, i) => {
      const t = this.textG.children[i] as SVGTextElement;
      t.setAttribute('x', String(xCenter(i)));
      t.setAttribute('y', String(yScale(v) - 3));
      t.textContent = v >= 1 ? Math.round(v).toString() : '';
    });
  }

  private drawMeans(
    means:       readonly MeanOverlay[],
    xContinuous: (v: number) => number,
  ): void {
    while(this.meansG.childElementCount < means.length) {
      const line = document.createElementNS(SVG_NS, 'line');
      this.meansG.appendChild(line);
    }
    while(this.meansG.childElementCount > means.length) this.meansG.lastChild!.remove();

    means.forEach((m, i) => {
      const line = this.meansG.children[i] as SVGLineElement;
      line.setAttribute('class', `histogram-mean ${m.className}`);
      const x = xContinuous(m.value);
      line.setAttribute('x1', String(x));
      line.setAttribute('x2', String(x));
      line.setAttribute('y1', '0');
      line.setAttribute('y2', String(this.innerH));
    });
  }

  // -- Axes ----------------------------------------------------------------------
  private drawXAxis(buckets: number, xCenter: (i: number) => number): void {
    while(this.xAxisG.firstChild) this.xAxisG.firstChild.remove();

    const axisLine = document.createElementNS(SVG_NS, 'line');
    axisLine.setAttribute('class', 'histogram-axis-line');
    axisLine.setAttribute('x1', '0');
    axisLine.setAttribute('x2', String(this.innerW));
    axisLine.setAttribute('y1', '0');
    axisLine.setAttribute('y2', '0');
    this.xAxisG.appendChild(axisLine);

    for(let i=0; i<buckets; i++) {
      const tickX = xCenter(i);

      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('class', 'histogram-axis-tick');
      tick.setAttribute('x1', String(tickX));
      tick.setAttribute('x2', String(tickX));
      tick.setAttribute('y1', '0');
      tick.setAttribute('y2', '3');
      this.xAxisG.appendChild(tick);

      // label only every other bucket past 5 to avoid crowding
      if((i < 5) || (i % 2 === 0)) {
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'histogram-axis-tick-label');
        label.setAttribute('x', String(tickX));
        label.setAttribute('y', '14');
        label.setAttribute('text-anchor', 'middle');
        label.textContent = String(i + 1);
        this.xAxisG.appendChild(label);
      } /* else -- past 5 and odd; skipped to keep axis labels readable */
    }
  }

  // ..............................................................................
  private drawYAxis(yMax: number): void {
    while(this.yAxisG.firstChild) this.yAxisG.firstChild.remove();

    const axisLine = document.createElementNS(SVG_NS, 'line');
    axisLine.setAttribute('class', 'histogram-axis-line');
    axisLine.setAttribute('x1', '0');
    axisLine.setAttribute('x2', '0');
    axisLine.setAttribute('y1', '0');
    axisLine.setAttribute('y2', String(this.innerH));
    this.yAxisG.appendChild(axisLine);

    // 4 evenly spaced ticks: 0, ¼, ½, ¾, 1 of yMax
    const steps = 4;
    for(let i=0; i<=steps; i++) {
      const v = (yMax * i) / steps;
      const y = this.innerH * (1 - i / steps);

      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('class', 'histogram-axis-tick');
      tick.setAttribute('x1', '-3');
      tick.setAttribute('x2', '0');
      tick.setAttribute('y1', String(y));
      tick.setAttribute('y2', String(y));
      this.yAxisG.appendChild(tick);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'histogram-axis-tick-label');
      label.setAttribute('x', '-6');
      label.setAttribute('y', String(y + 3));
      label.setAttribute('text-anchor', 'end');
      label.textContent = formatTick(v);
      this.yAxisG.appendChild(label);
    }
  }

  // ------------------------------------------------------------------------------
  private appendG(className: string): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.setAttribute('class', className);
    g.setAttribute('transform', `translate(${this.margin.left}, ${this.margin.top})`);
    this.svg.appendChild(g);
    return g;
  }
}

// == Util ========================================================================
/** rounds up to the nearest "nice" integer-ish value so the y-axis isn't jittery
 *  as the histogram grows */
const niceCeil = (v: number): number => {
  if(v <= 0) return 1;
  const exp  = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n    = v / base;

  // pick the next nice multiplier above n
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * base;
};

// --------------------------------------------------------------------------------
const formatTick = (v: number): string => {
  if(v === 0) return '0';
  if(v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  if(v >= 10)   return Math.round(v).toString();
  return v.toFixed(1).replace(/\.0$/, '');
};
