/** Whether two names are of one commit: equal, or one the abbreviation of the other, as an agent may name it. */
export function sameCommit(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}
