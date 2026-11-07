// Custom SVG shared by the views: severity list icons, the header card at the
// top of detail views and the grouped key/value card. Pure string builders, so
// they run in tests without Raycast.
//
// Telemetry is attacker-controlled: every string goes through `escapeXml`
// before it lands in the SVG, and the SVG is shipped as a base64 data URI, so
// it can never break out of the markdown image syntax.

export type Severity = "error" | "warn" | "info" | "ok" | "none";

const ERROR = new Set(["ERROR", "SEVERE", "CRITICAL", "ALERT", "FATAL", "EMERGENCY", "FAILED", "FAILURE"]);
const WARN = new Set(["WARN", "WARNING"]);
const INFO = new Set(["INFO", "DEBUG", "NOTICE", "TRACE"]);
const OK = new Set(["SUCCESS", "OK"]);

/** Maps a Dynatrace loglevel, aggregated status or span status code to a severity bucket. */
export function severityOf(...values: Array<string | undefined>): Severity {
  for (const v of values) {
    const u = v?.toUpperCase() ?? "";
    if (ERROR.has(u)) return "error";
    if (WARN.has(u)) return "warn";
    if (INFO.has(u)) return "info";
    if (OK.has(u)) return "ok";
  }
  return "none";
}

/** A log's severity: the aggregated status only overrides the level when it says error or ok. */
export function logSeverity(status: string | undefined, level: string | undefined): Severity {
  const fromStatus = severityOf(status);
  return fromStatus === "error" || fromStatus === "ok" ? fromStatus : severityOf(level, status);
}

interface Palette {
  accent: string;
  text: string;
  muted: string;
}

const ACCENTS: Record<Severity, { light: string; dark: string }> = {
  error: { light: "#D92D3A", dark: "#FF6369" },
  warn: { light: "#C77700", dark: "#FFB224" },
  info: { light: "#2F6FDE", dark: "#6E9BFF" },
  ok: { light: "#1F8A4C", dark: "#4CC38A" },
  none: { light: "#757575", dark: "#A0A0A0" },
};

function palette(severity: Severity, dark: boolean): Palette {
  const accent = ACCENTS[severity][dark ? "dark" : "light"];
  return dark ? { accent, text: "#F2F2F2", muted: "#9A9A9A" } : { accent, text: "#1D1D1F", muted: "#6E6E73" };
}

/** Canvas width in px: close to the Detail pane width, so fonts render near 1:1 instead of being scaled down. */
const W = 460;
/** Canvas width for views without a metadata pane, where the markdown gets the full window. */
export const FULL_WIDTH = 720;

export function escapeXml(s: string): string {
  // Characters outside the XML 1.0 Char production (control characters, lone surrogates, U+FFFE/U+FFFF) make the
  // whole SVG unparseable, so drop them rather than escape them.
  const printable = Array.from(s)
    .filter((c) => {
      const code = c.codePointAt(0) ?? 0;
      return (
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0d ||
        (code >= 0x20 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        code >= 0x10000
      );
    })
    .join("");
  return printable.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Collapses whitespace and cuts to `max` code points, so a surrogate pair is never split. */
function clip(s: string, max: number): string {
  const chars = Array.from(s.replace(/\s+/g, " ").trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

/** Rough glyph width in em for the system sans font: caps, digits and "_" are wide, punctuation and i/l/t narrow. */
function charEm(c: string): number {
  if (/[mwMW]/.test(c)) return 0.88;
  if (/\d/.test(c)) return 0.62;
  if (/[A-Z]/.test(c)) return 0.68;
  if (c === "_" || c === "-") return 0.55;
  if (/[ilIjtfr.,:;'|!()[\]/\\]/.test(c)) return 0.34;
  return 0.56;
}

const textWidth = (chars: readonly string[], fontSize: number) =>
  chars.reduce((sum, c) => sum + charEm(c), 0) * fontSize;

/**
 * Breaks a value into at most `maxLines` lines that fit `budget` px at `fontSize`, preferring to break after a
 * space; the last line ends in "…" when text is cut.
 */
function wrap(s: string, budget: number, fontSize: number, maxLines: number): string[] {
  const chars = Array.from(s.replace(/\s+/g, " ").trim());
  const lines: string[][] = [];
  let start = 0;
  while (start < chars.length && lines.length < maxLines) {
    let end = start;
    let used = 0;
    while (end < chars.length && used + charEm(chars[end]) * fontSize <= budget)
      used += charEm(chars[end++]) * fontSize;
    end = Math.max(end, start + 1);
    if (end < chars.length) {
      const space = chars.lastIndexOf(" ", end - 1);
      if (space > start) end = space + 1;
    }
    lines.push(chars.slice(start, end));
    start = end;
  }
  if (start < chars.length) {
    const last = lines[lines.length - 1];
    while (last.length > 1 && textWidth(last, fontSize) + charEm("…") * fontSize > budget) last.pop();
    last.push("…");
  }
  const out = lines.map((l) => l.join("").trimEnd());
  return out.length > 0 ? out : [""];
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Severity glyph drawn on a 24x24 grid, in `color`. */
function glyph(severity: Severity, color: string): string {
  const stroke = `class="as" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  switch (severity) {
    case "error":
      return `<circle cx="12" cy="12" r="9" ${stroke}/><path d="M9 9l6 6M15 9l-6 6" ${stroke}/>`;
    case "warn":
      return `<path d="M12 4L21 19H3Z" ${stroke}/><path d="M12 10v4" ${stroke}/><circle cx="12" cy="16.6" r="1" class="af" fill="${color}"/>`;
    case "info":
      return `<circle cx="12" cy="12" r="9" ${stroke}/><path d="M12 11v5" ${stroke}/><circle cx="12" cy="7.8" r="1" class="af" fill="${color}"/>`;
    case "ok":
      return `<circle cx="12" cy="12" r="9" ${stroke}/><path d="M8 12.5l2.7 2.7L16 9.5" ${stroke}/>`;
    default:
      return `<circle cx="12" cy="12" r="3" class="af" fill="${color}"/>`;
  }
}

/** Square list icon: a tinted tile with the severity glyph. */
export function severityIconSvg(severity: Severity, dark: boolean): string {
  const { accent } = palette(severity, dark);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="8" fill="${accent}" fill-opacity="0.16"/>` +
    `<g transform="translate(4 4)">${glyph(severity, accent)}</g></svg>`
  );
}

const iconCache = new Map<Severity, { source: { light: string; dark: string } }>();

/** `Image.Source` for a List.Item icon: Raycast picks the variant that matches the theme. Built once per severity. */
export function severityIcon(severity: Severity) {
  let icon = iconCache.get(severity);
  if (!icon) {
    icon = {
      source: {
        light: svgDataUri(severityIconSvg(severity, false)),
        dark: svgDataUri(severityIconSvg(severity, true)),
      },
    };
    iconCache.set(severity, icon);
  }
  return icon;
}

/**
 * Both palettes as CSS media rules, so a card that stays open follows the system theme without being rebuilt. The
 * inline attributes carry the palette picked at build time for renderers that ignore CSS.
 */
function themeStyle(severity: Severity): string {
  const rules = (dark: boolean) => {
    const { accent, text, muted } = palette(severity, dark);
    const zebra = dark ? "#FFFFFF;fill-opacity:0.07" : "#000000;fill-opacity:0.04";
    return `.t{fill:${text}}.m{fill:${muted}}.af{fill:${accent}}.as{stroke:${accent}}.z{fill:${zebra}}`;
  };
  return `<style>@media (prefers-color-scheme:light){${rules(false)}}@media (prefers-color-scheme:dark){${rules(true)}}</style>`;
}

export interface Header {
  severity: Severity;
  title: string;
  subtitle: string;
}

/** Wide header card for the top of a detail view. */
export function headerSvg({ severity, title, subtitle }: Header, dark: boolean, width = W): string {
  const p = palette(severity, dark);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="72" viewBox="0 0 ${width} 72" font-family="-apple-system, system-ui, sans-serif">` +
    themeStyle(severity) +
    `<rect class="af" width="${width}" height="72" rx="12" fill="${p.accent}" fill-opacity="0.12"/>` +
    `<rect class="af" width="5" height="72" rx="2.5" fill="${p.accent}"/>` +
    `<g transform="translate(18 18) scale(1.5)">${glyph(severity, p.accent)}</g>` +
    `<text x="62" y="34" font-size="18" font-weight="600" class="t" fill="${p.text}">${escapeXml(clip(title, Math.floor((width - 86) / 10.5)))}</text>` +
    `<text x="62" y="54" font-size="13" class="m" fill="${p.muted}">${escapeXml(clip(subtitle, Math.floor((width - 86) / 6.4)))}</text>` +
    `</svg>`
  );
}

/** Markdown image for the header; the data URI is base64, so no markdown or XML can leak out of it. */
export function headerMarkdown(header: Header, dark: boolean, width = W): string {
  return `![](${svgDataUri(headerSvg(header, dark, width))})`;
}

export interface KeyValueGroup {
  title: string;
  rows: ReadonlyArray<readonly [key: string, value: string]>;
}

/** Left edge of the value column. */
const VALUE_X = 196;
const VALUE_FONT = 13;
/** Longer values are cut with "…" after this many lines. */
const MAX_VALUE_LINES = 8;
const LINE_H = 18;
const ROW_PAD = 14;
const GROUP_H = 40;

/** Grouped key/value card: one titled block per non-empty group, long values wrapped onto several lines. */
export function keyValueGroupsSvg(groups: readonly KeyValueGroup[], dark: boolean, width = W): string {
  // Width in px available to a value, from the value column to the card edge.
  const valueBudget = width - VALUE_X - 16;
  const shown = groups.filter((g) => g.rows.length > 0);
  if (shown.length === 0) return "";
  const p = palette("none", dark);
  const line = dark ? "#FFFFFF" : "#000000";
  let y = 8;
  const parts: string[] = [];
  shown.forEach((g, gi) => {
    parts.push(
      `<text x="12" y="${y + 24}" font-size="12" font-weight="700" letter-spacing="1" class="m" fill="${p.muted}">${escapeXml(g.title.toUpperCase())}</text>`,
    );
    y += GROUP_H;
    g.rows.forEach(([k, v], i) => {
      const lines = wrap(v, valueBudget, VALUE_FONT, MAX_VALUE_LINES);
      const h = ROW_PAD + lines.length * LINE_H;
      if (i % 2 === 0)
        parts.push(
          `<rect x="4" y="${y}" width="${width - 8}" height="${h}" rx="6" class="z" fill="${line}" fill-opacity="${dark ? 0.07 : 0.04}"/>`,
        );
      parts.push(
        `<text x="12" y="${y + 21}" font-size="12" class="m" fill="${p.muted}">${escapeXml(clip(k, 30))}</text>`,
      );
      lines.forEach((l, li) =>
        parts.push(
          `<text x="${VALUE_X}" y="${y + 21 + li * LINE_H}" font-size="${VALUE_FONT}" class="t" fill="${p.text}">${escapeXml(l)}</text>`,
        ),
      );
      y += h;
    });
    if (gi < shown.length - 1) y += 6;
  });
  y += 8;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}" font-family="-apple-system, system-ui, sans-serif">` +
    themeStyle("none") +
    parts.join("") +
    `</svg>`
  );
}

/** Markdown image for the grouped fields card; "" when there is nothing to show. */
export function keyValueGroupsMarkdown(groups: readonly KeyValueGroup[], dark: boolean, width = W): string {
  const svg = keyValueGroupsSvg(groups, dark, width);
  return svg ? `![](${svgDataUri(svg)})` : "";
}
