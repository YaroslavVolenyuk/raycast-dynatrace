// THREAT_MODEL.md R1, R2: telemetry may reach Detail markdown only inside a code
// fence or as a generated SVG data URI. What is left outside both must be the
// view's own constant text, so a test can list it.

const SVG_IMAGE = /^!\[\]\(data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*\)$/;

/** A value that breaks out of anything but a fence or an escaped SVG: images, links, headings, HTML, a fence. */
export const HOSTILE =
  'x\n\n![b](https://evil.example/p.png) [l](https://evil.example)\n```\n# H <img src=x onerror=1> "`';

/** The non-blank lines outside code fences and SVG images; an unclosed fence is reported too. */
export function unfencedLines(markdown: string): string[] {
  const out: string[] = [];
  let fence: string | undefined;
  for (const line of markdown.split("\n")) {
    if (fence) {
      if (line === fence) fence = undefined;
      continue;
    }
    const open = /^(`{3,})[\w-]*$/.exec(line);
    if (open) fence = open[1];
    else if (line.trim() && !SVG_IMAGE.test(line)) out.push(line);
  }
  if (fence) out.push(`unclosed fence ${fence}`);
  return out;
}
