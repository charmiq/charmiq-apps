// the Platform bundler loads an unknown file type as text (the packed LDraw parts)
declare module '*.ldr' {
  const text: string;
  export default text;
}
