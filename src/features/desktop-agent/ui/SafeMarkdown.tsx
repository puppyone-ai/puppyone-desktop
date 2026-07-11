import { Check, Copy } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

type SafeMarkdownProps = { text: string; streaming?: boolean };

const MAX_INITIAL_MARKDOWN_TEXT = 24 * 1024;
const MAX_INITIAL_MARKDOWN_BLOCKS = 240;

/**
 * Deliberately renders a small Markdown surface to React nodes. Raw HTML is
 * always text, URLs use an explicit protocol policy, and no innerHTML path
 * exists at the Agent boundary.
 */
export function SafeMarkdown({ text, streaming = false }: SafeMarkdownProps) {
  const [expanded, setExpanded] = useState(false);
  const candidate = expanded ? text : initialMarkdownWindow(text);
  const parsedBlocks = parseBlocks(candidate);
  const initiallyTruncated = text.length > MAX_INITIAL_MARKDOWN_TEXT
    || parsedBlocks.length > MAX_INITIAL_MARKDOWN_BLOCKS;
  const blocks = expanded ? parsedBlocks : parsedBlocks.slice(0, MAX_INITIAL_MARKDOWN_BLOCKS);
  return (
    <div className="desktop-agent-markdown">
      {blocks.map((block, index) => renderBlock(block, index))}
      {streaming && <span className="desktop-agent-stream-caret" aria-hidden="true" />}
      {(expanded || initiallyTruncated) && (
        <button
          type="button"
          className="desktop-agent-markdown-disclosure"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Collapse long response" : "Show full response"}
        </button>
      )}
    </div>
  );
}

function initialMarkdownWindow(text: string) {
  if (text.length <= MAX_INITIAL_MARKDOWN_TEXT) return text;
  const headLength = Math.floor(MAX_INITIAL_MARKDOWN_TEXT * 0.75);
  const tailLength = MAX_INITIAL_MARKDOWN_TEXT - headLength;
  return `${text.slice(0, headLength)}\n\n… long response collapsed …\n\n${text.slice(-tailLength)}`;
}

type MarkdownBlock =
  | { kind: "code"; language: string; value: string }
  | { kind: "heading"; level: number; value: string }
  | { kind: "quote"; value: string }
  | { kind: "list"; ordered: boolean; values: string[] }
  | { kind: "paragraph"; value: string };

function parseBlocks(input: string): MarkdownBlock[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const fence = /^```([^\s`]*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) body.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language: fence[1].slice(0, 30), value: body.join("\n").slice(0, 128 * 1024) });
      continue;
    }
    if (!line.trim()) { index += 1; continue; }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, value: heading[2] });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const values: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) values.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", value: values.join("\n") });
      continue;
    }
    const list = /^(\s*)([-*+] |\d+\. )(.+)$/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[2]);
      const values: string[] = [];
      while (index < lines.length) {
        const item = /^(\s*)([-*+] |\d+\. )(.+)$/.exec(lines[index]);
        if (!item || /\d/.test(item[2]) !== ordered) break;
        values.push(item[3]);
        index += 1;
      }
      blocks.push({ kind: "list", ordered, values });
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index])) paragraph.push(lines[index++]);
    blocks.push({ kind: "paragraph", value: paragraph.join("\n") });
  }
  return blocks;
}

function startsBlock(line: string) {
  return /^```|^#{1,4}\s|^>\s?|^(\s*)([-*+] |\d+\. )/.test(line);
}

function renderBlock(block: MarkdownBlock, key: number) {
  if (block.kind === "code") return <CodeBlock key={key} language={block.language} value={block.value} />;
  if (block.kind === "heading") {
    const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4";
    return <Tag key={key}>{renderInline(block.value)}</Tag>;
  }
  if (block.kind === "quote") return <blockquote key={key}>{renderInline(block.value)}</blockquote>;
  if (block.kind === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return <Tag key={key}>{block.values.map((value, index) => <li key={index}>{renderInline(value)}</li>)}</Tag>;
  }
  return <p key={key}>{renderInline(block.value)}</p>;
}

function renderInline(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    const token = match[0];
    if (token.startsWith("`")) nodes.push(<code key={index}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = safeHref(link?.[2] ?? "");
      nodes.push(href
        ? <a key={index} href={href} target="_blank" rel="noreferrer">{link?.[1]}</a>
        : <Fragment key={index}>{link?.[1] ?? token}</Fragment>);
    } else if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else nodes.push(<em key={index}>{token.slice(1, -1)}</em>);
    cursor = index + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function safeHref(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="desktop-agent-code-block">
      <div><span>{language || "text"}</span><button type="button" onClick={() => {
        const copy = navigator.clipboard?.writeText(value);
        void copy?.then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_200);
        }).catch(() => {});
      }}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}</button></div>
      <pre><code>{value}</code></pre>
    </div>
  );
}

export const safeMarkdownLimits = Object.freeze({
  maxInitialText: MAX_INITIAL_MARKDOWN_TEXT,
  maxInitialBlocks: MAX_INITIAL_MARKDOWN_BLOCKS,
});
