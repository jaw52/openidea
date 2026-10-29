import { describe, expect, it } from "vitest";
import { Chunk, MergeView } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { bandPath, bandsOf, transferY } from "../diffScroll";

const doc = (s: string) => Text.of(s.split("\n"));
const LINE = 20;

/** Bands of two texts with every line LINE px tall. */
function bands(a: string, b: string) {
  const da = doc(a);
  const db = doc(b);
  const ext = (d: Text, from: number, to: number): [number, number] => {
    if (from > d.length) return [d.lines * LINE, d.lines * LINE];
    const top = (d.lineAt(from).number - 1) * LINE;
    return from >= to ? [top, top] : [top, d.lineAt(Math.min(to - 1, d.length)).number * LINE];
  };
  return bandsOf(
    Chunk.build(da, db),
    (c) => ext(da, c.fromA, c.toA),
    (c) => ext(db, c.fromB, c.toB),
    da.lines * LINE,
    db.lines * LINE,
  );
}

describe("unaligned side-by-side scrolling", () => {
  // Right side inserts three lines after line 2 and changes line 5 into two lines.
  const a = "1\n2\n3\n4\n5\n6\n7";
  const b = "1\n2\nx\ny\nz\n3\n4\nfive\nfive'\n6\n7";
  const all = bands(a, b);

  it("splits both documents into unchanged and changed bands", () => {
    expect(all.map((x) => [x.a0, x.a1, x.b0, x.b1, x.changed])).toEqual([
      [0, 40, 0, 40, false],
      [40, 40, 40, 100, true],
      [40, 80, 100, 140, false],
      [80, 100, 140, 180, true],
      [100, 140, 180, 220, false],
    ]);
  });

  it("maps unchanged text straight through", () => {
    expect(transferY(all, 10, "a")).toBe(10);
    expect(transferY(all, 50, "a")).toBe(110);
    expect(transferY(all, 130, "a")).toBe(210);
    expect(transferY(all, 210, "b")).toBe(130);
  });

  it("jumps over an insertion when scrolling the side without it", () => {
    expect(transferY(all, 39, "a")).toBe(39);
    expect(transferY(all, 40, "a")).toBe(100);
  });

  it("waits at the boundary while the inserted lines scroll by", () => {
    for (const y of [40, 60, 99]) expect(transferY(all, y, "b")).toBe(40);
  });

  it("follows line by line inside a change, then waits at the shorter end", () => {
    expect(transferY(all, 150, "b")).toBe(90);
    expect(transferY(all, 170, "b")).toBe(100);
    expect(transferY(all, 90, "a")).toBe(150);
  });

  it("scales unchanged text of different heights (wrapped lines)", () => {
    const stretched = [{ a0: 0, a1: 100, b0: 0, b1: 200, changed: false }];
    expect(transferY(stretched, 50, "a")).toBe(100);
    expect(transferY(stretched, 50, "b")).toBe(25);
  });

  it("draws an empty side as a sliver on its boundary", () => {
    expect(bandPath(30, 40, 40, 40, 100)).toBe("M0 39C9 39 21 40 30 40L30 100C21 100 9 41 0 41Z");
  });

  it("can keep MergeView from padding the panes", () => {
    // UnalignedPanes replaces this (private) method; a rename upstream would bring the padding back.
    expect(typeof (MergeView.prototype as unknown as { measure: unknown }).measure).toBe("function");
  });
});
