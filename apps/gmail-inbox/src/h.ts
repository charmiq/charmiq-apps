// a tiny JSX factory that builds REAL DOM — TSX here is nothing more than typed
// sugar for document.createElement. No virtual DOM, no reactivity, no hooks: an
// element is created once and then manipulated directly. `/** @jsx h */` at the
// top of each .tsx routes JSX through this
// ********************************************************************************
// == Types =======================================================================
export type Child = Node | string | number | false | null | undefined | Child[];

/** a "component" is just a function that returns a DOM node from its props */
export type Component<P = Record<string, unknown>> = (props: P & { children?: Child[]; }) => Node;

// SVG elements must be created in the SVG namespace, or the browser makes inert
// HTMLUnknownElements. Every tag here is SVG-only, so a name check is enough
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'rect', 'polyline', 'polygon', 'ellipse', 'g', 'defs', 'use']);

// == Factory =====================================================================
export const h = (
  type: string | Component<any>,
  props: Record<string, any> | null,
  ...children: Child[]
): Node => {
  if(typeof type === 'function') return type({ ...(props ?? {}), children });

  const element = SVG_TAGS.has(type)
    ? document.createElementNS(SVG_NS, type)
    : document.createElement(type);
  if(props) applyProps(element, props);
  append(element, children);
  return element;
};

/** Fragment groups children without a wrapper element */
export const Fragment: Component = ({ children }): Node => {
  const fragment = document.createDocumentFragment();
  append(fragment, children ?? []);
  return fragment;
};

// == Internal ====================================================================
const applyProps = (element: Element, props: Record<string, any>): void => {
  for(const [key, value] of Object.entries(props)) {
    if((value === null) || (value === undefined) || (value === false) || (key === 'children')) continue;

    if(key.startsWith('on') && (typeof value === 'function')) {
      element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if((key === 'style') && (typeof value === 'object')) {
      Object.assign((element as HTMLElement).style, value);
    } else if(value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
};

const append = (parent: Node, children: Child[]): void => {
  for(const child of children) {
    if((child === null) || (child === undefined) || (child === false)) continue;
    if(Array.isArray(child)) { append(parent, child); continue; }
    parent.appendChild((child instanceof Node) ? child : document.createTextNode(String(child)));
  }
};
