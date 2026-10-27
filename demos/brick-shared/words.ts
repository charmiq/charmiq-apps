// the words Brick Studio and Stop Motion put a refusal's names in, as a sentence
// reads them
// ********************************************************************************
// == Lists =======================================================================
/** names in a sentence: "A", "A and B", "A, B and C" (or `or` for a choice) */
export const listed = (names: ReadonlyArray<string>, conjunction: 'and' | 'or' = 'and'): string => (names.length < 2) ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
