import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";

const disk = new Map<string, string>();
const editors = new Map<string, EditorState>();

vi.mock(import("@/platform/ipc"), async (importOriginal) => ({
  ...(await importOriginal()),
  commands: { fsReadText: (path: string) => path } as never,
  call: (async (path: string) => disk.get(path) ?? Promise.reject(new Error("missing"))) as never,
}));
vi.mock("@/editor/api", () => ({
  editorsFor: (path: string) => {
    const state = editors.get(path);
    return state ? [{ view: { state } }] : [];
  },
}));

const { clearPreviewCache, lineTokens, peekLineTokens } = await import("../find/preview");

const SOURCE = ["/**", " * A read-only virtual document (library", " */", 'const lib = "x";'].join("\n");
const classesOf = (text: string, tokens: Array<{ from: number; to: number; cls: string }>) =>
  tokens.map((t) => `${text.slice(t.from, t.to)}:${t.cls}`);

describe("lineTokens", () => {
  beforeEach(() => {
    clearPreviewCache();
    disk.clear();
    editors.clear();
  });

  it("colours a line inside a block comment with the whole file as context", async () => {
    disk.set("/p/a.ts", SOURCE);
    const text = "* A read-only virtual document (library";
    const tokens = await lineTokens("/p/a.ts", 1, 1, text);
    expect(classesOf(text, tokens)).toEqual([`${text}:tok-comment`]);
    expect(peekLineTokens("/p/a.ts", 1, 1, text)).toBe(tokens);
  });

  it("keeps positions relative to the shown text", async () => {
    disk.set("/p/a.ts", SOURCE);
    const text = 'lib = "x";';
    const tokens = await lineTokens("/p/a.ts", 3, 6, text);
    expect(classesOf(text, tokens)).toContain('"x":tok-string');
  });

  it("parses the line on its own when the file no longer has it there", async () => {
    disk.set("/p/a.ts", SOURCE);
    const text = "* A read-only virtual document (library";
    const tokens = await lineTokens("/p/a.ts", 0, 0, text);
    expect(classesOf(text, tokens)).not.toContain(`${text}:tok-comment`);
  });

  it("parses again when the open editor's document changes", async () => {
    editors.set("/p/a.ts", EditorState.create({ doc: SOURCE.replace("/**", "//") }));
    const text = "* A read-only virtual document (library";
    expect(classesOf(text, await lineTokens("/p/a.ts", 1, 1, text))).not.toContain(`${text}:tok-comment`);
    editors.set("/p/a.ts", EditorState.create({ doc: SOURCE }));
    expect(classesOf(text, await lineTokens("/p/a.ts", 1, 1, text))).toEqual([`${text}:tok-comment`]);
  });

  it("leaves files of unknown languages plain", async () => {
    disk.set("/p/a.unknownext", SOURCE);
    expect(await lineTokens("/p/a.unknownext", 1, 1, "* A read-only")).toEqual([]);
  });
});
