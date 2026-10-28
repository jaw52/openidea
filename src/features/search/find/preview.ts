import { Text } from "@codemirror/state";
import { editorsFor } from "@/editor/api";
import { codeHighlighter, highlightTokens, languageForPath, type CodeToken } from "@/editor/lsp/markdown";
import { call, commands } from "@/platform/ipc";

const cache = new Map<string, Promise<string>>();

/**
 * File text for the preview pane: the live buffer of an open editor, else a
 * read-only backend read (doesn't open a document or touch recent files).
 */
export function loadPreviewText(path: string): Promise<string> {
  const view = editorsFor(path)[0]?.view;
  if (view) return Promise.resolve(view.state.doc.toString());
  return loadDiskText(path);
}

function loadDiskText(path: string): Promise<string> {
  let p = cache.get(path);
  if (!p) {
    p = (async () => {
      return call(commands.fsReadText(path));
    })();
    p.catch(() => cache.delete(path));
    cache.set(path, p);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return p;
}

export function clearPreviewCache() {
  cache.clear();
  highlighted.clear();
}

/** Bigger files aren't parsed whole: their result lines are coloured on their own. */
const MAX_PARSE = 500_000;

interface Parsed {
  doc: Text;
  highlight: (from: number, to: number) => CodeToken[];
}

/**
 * One file parsed whole, like IDEA's `ChunkExtractor`: `source` is the editor
 * document or the disk text it was parsed from, so an edit (a new `Text`) or a
 * re-read (a new string) parses again.
 */
interface Highlighted {
  source: Text | string;
  parsed: Promise<Parsed | null>;
  /** Tokens per result line (`lineKey`). */
  lines: Map<string, CodeToken[]>;
}
const highlighted = new Map<string, Highlighted>();

const lineKey = (line: number, start: number, text: string) => `${line}\u0000${start}\u0000${text}`;

/** `lineTokens` already computed for the file as last parsed (for a first render without flicker). */
export function peekLineTokens(path: string, line: number, start: number, text: string): CodeToken[] | null {
  return highlighted.get(path)?.lines.get(lineKey(line, start, text)) ?? null;
}

/**
 * Syntax tokens of a result line (`text` at column `start` of 0-based `line`),
 * positions within `text`, coloured with the whole file as context. When the
 * file no longer has `text` there (changed since the search) or is too big,
 * the line is parsed on its own.
 */
export async function lineTokens(path: string, line: number, start: number, text: string): Promise<CodeToken[]> {
  const language = languageForPath(path);
  if (!language || !text) return [];
  const source = editorsFor(path)[0]?.view.state.doc ?? (await loadDiskText(path).catch(() => null));
  if (source == null) return highlightTokens(text, language);
  let h = highlighted.get(path);
  if (h?.source !== source) {
    h = { source, parsed: parseWhole(source, language), lines: new Map() };
    highlighted.delete(path);
    highlighted.set(path, h);
    if (highlighted.size > 40) highlighted.delete(highlighted.keys().next().value!);
  }
  const key = lineKey(line, start, text);
  const known = h.lines.get(key);
  if (known) return known;
  const parsed = await h.parsed;
  let tokens: CodeToken[] | null = null;
  if (parsed && line < parsed.doc.lines) {
    const l = parsed.doc.line(line + 1);
    if (l.text.slice(start, start + text.length) === text) {
      const from = l.from + start;
      tokens = parsed.highlight(from, from + text.length).map((t) => ({ ...t, from: t.from - from, to: t.to - from }));
    }
  }
  tokens ??= await highlightTokens(text, language);
  h.lines.set(key, tokens);
  return tokens;
}

async function parseWhole(source: Text | string, language: string): Promise<Parsed | null> {
  if (source.length > MAX_PARSE) return null;
  const text = typeof source === "string" ? source : source.toString();
  const highlight = await codeHighlighter(text, language);
  if (!highlight) return null;
  // Splitting on "\n" alone keeps a "\r" in its line, so offsets match `text`.
  return { doc: typeof source === "string" ? Text.of(text.split("\n")) : source, highlight };
}
