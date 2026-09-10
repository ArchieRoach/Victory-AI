import fs from "fs";
import path from "path";
import { light, dark } from "./palette";

// index.css stores each --victory-* token as "R G B" channels (so Tailwind's
// /opacity modifiers work). palette.js is the hex source of truth. This test
// fails if the two drift apart.
const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

const hexToChannels = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

function victoryVarsInBlock(re) {
  const block = css.match(re);
  if (!block) throw new Error("theme block not found in index.css: " + re);
  const out = {};
  for (const m of block[0].matchAll(/--victory-([a-z-]+):\s*([\d ]+?);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const asChannels = (palette) =>
  Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, hexToChannels(v)]));

test(":root light palette in index.css matches palette.js", () => {
  expect(victoryVarsInBlock(/:root\s*{[^}]*}/)).toEqual(asChannels(light));
});

test('[data-theme="dark"] palette in index.css matches palette.js', () => {
  expect(victoryVarsInBlock(/:root\[data-theme="dark"\]\s*{[^}]*}/)).toEqual(asChannels(dark));
});

test("prefers-color-scheme dark block matches the data-theme dark block", () => {
  const media = victoryVarsInBlock(/:root:not\(\[data-theme="light"\]\)\s*{[^}]*}/);
  expect(media).toEqual(asChannels(dark));
});
