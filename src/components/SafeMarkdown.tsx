import { Fragment, type ReactNode } from "react";
import css from "./SafeMarkdown.module.scss";

/**
 * A document's markdown (documents-api) rendered as React text — never as HTML: no `dangerouslySetInnerHTML`, an HTML
 * tag in the source shows as plain text, and a link shows its words only (no URL is ever made clickable). Covers what
 * the church's documents use: headings, paragraphs, line breaks, bullet / numbered lists, **bold**, *italic*, `code`.
 */

type Block = { kind: "h"; level: 1 | 2 | 3; text: string } | { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] } | { kind: "hr" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", lines: para });
    para = [];
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "hr" });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: "h", level: Math.min(3, h[1].length) as 1 | 2 | 3, text: h[2] });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (para.length) {
        blocks.push({ kind: "p", lines: para });
        para = [];
      }
      if (!list || list.kind !== kind) {
        if (list) blocks.push(list);
        list = { kind, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    if (list) {
      blocks.push(list);
      list = null;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** inline marks → React nodes (text is always text) */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // links keep their words only; images keep their alt text
  const plain = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(plain))) {
    if (m.index > last) out.push(plain.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={key++}>{inline(m[2])}</strong>);
    else if (m[4] !== undefined) out.push(<em key={key++}>{inline(m[4])}</em>);
    else out.push(<code key={key++}>{m[5]}</code>);
    last = m.index + m[0].length;
  }
  if (last < plain.length) out.push(plain.slice(last));
  return out;
}

export default function SafeMarkdown({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={`${css.doc} ${className ?? ""}`}>
      {parseBlocks(markdown).map((b, i) => {
        if (b.kind === "h") {
          const Tag = b.level === 1 ? "h3" : b.level === 2 ? "h4" : "h5";
          return <Tag key={i}>{inline(b.text)}</Tag>;
        }
        if (b.kind === "hr") return <hr key={i} />;
        if (b.kind === "p")
          return (
            <p key={i}>
              {b.lines.map((line, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {inline(line)}
                </Fragment>
              ))}
            </p>
          );
        const List = b.kind;
        return (
          <List key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
