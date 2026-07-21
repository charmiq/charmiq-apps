// The app pulls in no framework at runtime — JSX compiles to the local h() factory
// (see h.ts), which returns real DOM. So the only thing to declare is the global
// JSX namespace classic JSX (`/** @jsx h */`) resolves against: a JSX element is a
// DOM Node, and intrinsic elements accept any attributes (raw HTML attrs aren't
// what this app guards)
// ********************************************************************************
declare namespace JSX {
  type Element = Node;
  interface IntrinsicElements { [tagName: string]: any; }
  interface ElementChildrenAttribute { children: unknown; }
}
