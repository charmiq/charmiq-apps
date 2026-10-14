// the least and greatest of a list of numbers, of any length
// ********************************************************************************
/** the least of the values, `none` when there are none. A loop: a spread into
 *  `Math.min` overflows the stack on a build-sized list */
export const minOf = (values: Iterable<number>, none = Infinity): number => {
  let least = none;
  for(const value of values) if(value < least) least = value;
  return least;
};
/** the greatest of the values, `none` when there are none (SEE: minOf) */
export const maxOf = (values: Iterable<number>, none = -Infinity): number => {
  let greatest = none;
  for(const value of values) if(value > greatest) greatest = value;
  return greatest;
};
