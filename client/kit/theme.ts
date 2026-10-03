import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";

/** Paseo's own spacing, radius and type steps, so the plugin's controls sit flush with the host's. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const RADIUS = { control: 6, card: 8, pill: 16 } as const;
export const FONT = { small: 12, base: 14, title: 18 } as const;
export const CONTROL = { height: 32, small: 28, pressed: 0.85, faded: 0.5 } as const;

export type Colors = PluginTheme["colors"];

/** Styles built once per theme; `make` reads only the theme and what the caller lists in `deps`. */
export function useStyles<T>(theme: PluginTheme, make: (colors: Colors) => T, deps: readonly unknown[] = []): T {
  return useMemo(() => make(theme.colors), [theme, ...deps]);
}

/** How a press looks: faded while it cannot be pressed, dimmed while held. */
export const pressState = (disabled: boolean | undefined, pressed: boolean) =>
  disabled ? { opacity: CONTROL.faded } : pressed ? { opacity: CONTROL.pressed } : null;

/** A theme colour faded, for a tint behind words of that colour; a colour that is not plain hex is used as it is. */
export function faded(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
