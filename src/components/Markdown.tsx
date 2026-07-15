import type { ReactNode } from "react";

/**
 * A deliberately small Markdown renderer for release notes.
 *
 * Why hand-rolled: the app's CSP blocks external scripts, and the release notes
 * only ever use a handful of constructs. This covers exactly those and nothing
 * else. It builds React nodes rather than HTML strings — there is no
 * `dangerouslySetInnerHTML` here, so text from a release body can never inject
 * markup, however it's written.
 *
 * Supported: `##`/`###` headings, `-`/`*` bullets, `---` rules, paragraphs, and
 * inline `**bold**` + `` `code` ``. Anything else renders as plain text, which
 * is the correct failure mode: worst case you read the raw characters.
 */

/** Split one line into inline nodes: **bold** and `code`. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // One pass over both patterns so they can't interleave incorrectly.
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-txt">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="rounded bg-edge px-1 py-0.5 font-mono text-[0.9em] text-txt"
        >
          {m[2]}
        </code>,
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : [text];
}

export default function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  // Normalise CRLF — GitHub release bodies come back with Windows line endings,
  // which would otherwise leave a stray \r on every parsed line.
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="flex flex-col gap-1.5 pl-1">
        {items.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[1px] shrink-0 text-accent">•</span>
            <span className="min-w-0 flex-1">{inline(b, `li-${blocks.length}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    if (/^---+$/.test(line)) {
      flushBullets();
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-1 border-edge" />);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets();
      const depth = heading[1].length;
      const body = heading[2];
      blocks.push(
        depth <= 2 ? (
          <h3
            key={`h-${blocks.length}`}
            className="mt-2 text-[14.5px] font-black uppercase tracking-tight text-txt first:mt-0"
          >
            {inline(body, `h-${blocks.length}`)}
          </h3>
        ) : (
          <h4
            key={`h-${blocks.length}`}
            className="mt-2 text-[11px] font-bold uppercase tracking-widest text-accent first:mt-0"
          >
            {inline(body, `h-${blocks.length}`)}
          </h4>
        ),
      );
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed">
        {inline(line, `p-${blocks.length}`)}
      </p>,
    );
  }
  flushBullets();

  return <div className="flex flex-col gap-2 text-[12.5px] text-txt2">{blocks}</div>;
}
