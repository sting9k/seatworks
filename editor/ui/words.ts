/** A count with its noun, in the plural unless it is one. */
export const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
