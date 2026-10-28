import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

vi.mock("../find/preview", () => ({
  loadPreviewText: async () => "",
  clearPreviewCache: () => {},
  peekLineTokens: () => null,
  lineTokens: async () => [
    { from: 0, to: 5, cls: "tok-keyword" },
    { from: 12, to: 17, cls: "tok-string" },
  ],
}));

const { MatchText } = await import("../find/parts");

describe("MatchText", () => {
  it("colours the line by its file's tokens under the match highlight", async () => {
    const { container } = render(
      <MatchText text={'const lib = "lib";'} ranges={[[6, 9]]} source={{ path: "/p/a.ts", line: 3, col: 0 }} />,
    );
    await act(() => Promise.resolve());
    expect(container.querySelector(".tok-keyword")?.textContent).toBe("const");
    expect(container.querySelector("mark")?.textContent).toBe("lib");
    expect(container.querySelector(".tok-string")?.textContent).toBe('"lib"');
    expect(container.textContent).toBe('const lib = "lib";');
  });

  it("stays plain without a source", () => {
    const { container } = render(<MatchText text="const lib" ranges={[[6, 9]]} />);
    expect(container.querySelector("[class^=tok-]")).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("lib");
  });
});
