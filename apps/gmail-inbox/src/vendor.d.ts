// type stubs for the modules resolved via importMap at runtime (preact + hooks).
// Minimal, but real enough that component props and hook calls are type-checked;
// the intrinsic-element surface is intentionally loose (raw HTML attributes are
// not what this app is guarding). Classic JSX (`/** @jsx h */`) resolves against
// the global JSX namespace declared below
// ********************************************************************************
declare namespace JSX {
  interface IntrinsicAttributes { key?: string | number; }
  interface IntrinsicElements { [tagName: string]: any; }
  interface ElementChildrenAttribute { children: unknown; }
  type Element = import('preact').VNode<any>;
}

declare module 'preact' {
  export type ComponentChild = VNode<any> | string | number | boolean | null | undefined;
  export type ComponentChildren = ComponentChild[] | ComponentChild;

  export interface VNode<P = any> { type: unknown; props: P; key: unknown; }
  export type ComponentType<P = {}> = (props: P) => VNode<any> | null;

  export function h(type: string, props: unknown, ...children: ComponentChildren[]): VNode<any>;
  export function h<P>(type: ComponentType<P>, props: P, ...children: ComponentChildren[]): VNode<any>;

  export function render(vnode: VNode<any>, parent: Element | Document | ShadowRoot | DocumentFragment): void;

  export const Fragment: ComponentType<{ children?: ComponentChildren; }>;
}

declare module 'preact/hooks' {
  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useRef<T>(initial: T): { current: T; };
  export function useRef<T>(initial: T | null): { current: T | null; };
}

declare module 'preact/jsx-runtime' {
  export {};
}
