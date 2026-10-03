/** A role as a person reads it: the profile's own name for it, which the surface never writes for itself. */
export const titled = (role: string): string => role.charAt(0).toUpperCase() + role.slice(1).replaceAll("-", " ");

/** The last part of a path, as a project is named where Paseo shows no name of its own. */
export const nameOf = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** A sum of money as the surface says one. */
export const money = (usd: number): string => `$${usd.toFixed(2)}`;

const UNITS = ["B", "KB", "MB", "GB"] as const;

/** A size on disk as the surface says one: a whole number of the unit that keeps it short, a tenth more past a GB. */
export function bytesOf(bytes: number): string {
  let size = bytes;
  let unit = 0;
  while (Math.round(size) >= 1000 && unit < UNITS.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return `${unit === UNITS.length - 1 ? size.toFixed(1) : Math.round(size)} ${UNITS[unit]!}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** A day as the surface says one: its number and month, and its year when that is not this one. */
export function dayOf(iso: string, thisYear: number): string {
  const at = new Date(iso);
  const day = `${at.getDate()} ${MONTHS[at.getMonth()]!}`;
  return at.getFullYear() === thisYear ? day : `${day} ${at.getFullYear()}`;
}
