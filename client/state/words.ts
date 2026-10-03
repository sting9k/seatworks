/** A role as a person reads it: the profile's own name for it, which the surface never writes for itself. */
export const titled = (role: string): string => role.charAt(0).toUpperCase() + role.slice(1).replaceAll("-", " ");

/** The last part of a path, as a project is named where Paseo shows no name of its own. */
export const nameOf = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** A sum of money as the surface says one. */
export const money = (usd: number): string => `$${usd.toFixed(2)}`;
