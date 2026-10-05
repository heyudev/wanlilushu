import { describe, expect, it } from "vitest";
import charset from "../data/font-charset.json";

// every UI and data file, as text
const files = import.meta.glob<string>(["../**/*.{ts,tsx,json}", "!../data/font-charset.json"], { query: "?raw", import: "default", eager: true });

describe("serif font subset", () => {
  it("covers every character used by the UI and the data (run `npm run fonts` after changing them)", () => {
    const known = new Set([...charset.covered, ...charset.notInFont]);
    const missing = new Set<string>();
    for (const text of Object.values(files)) {
      for (const ch of text) if (ch.codePointAt(0)! > 0x7f && ch.trim() && !known.has(ch)) missing.add(ch);
    }
    expect(Object.keys(files).length).toBeGreaterThan(20);
    expect([...missing].join("")).toBe("");
  });
});
