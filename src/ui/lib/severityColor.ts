import { Color } from "@raycast/api";
import type { Severity } from "./svg";

const COLORS: Record<Severity, Color> = {
  error: Color.Red,
  warn: Color.Yellow,
  info: Color.Blue,
  ok: Color.Green,
  none: Color.SecondaryText,
};

/** Raycast tag color for a severity bucket. */
export function severityColor(severity: Severity): Color {
  return COLORS[severity];
}
