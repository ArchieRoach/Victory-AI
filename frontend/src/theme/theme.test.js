import fs from "fs";
import path from "path";
import { light, dark, themeCss, themeVars, installTheme, hexToChannels, getPalette } from "./theme";

test("both palettes define exactly the same colours", () => {
  expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  expect(themeVars("light").match(/--[\w-]+:/g).sort()).toEqual(themeVars("dark").match(/--[\w-]+:/g).sort());
});

test("the CSS is generated from the palettes, for light, dark and the phone setting", () => {
  const css = themeCss();
  expect(css).toContain(`--victory-bg: ${hexToChannels(light.bg)};`);
  expect(css).toContain(`:root[data-theme="dark"] {`);
  expect(css).toContain(`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"])`);
  expect(css.split(`--victory-lime: ${hexToChannels(dark.lime)};`).length - 1).toBe(2);
  expect(hexToChannels("#E8FF47")).toBe("232 255 71");
  expect(getPalette("light")).toBe(light);
  expect(getPalette("anything else")).toBe(dark);
});

test("installing twice keeps one style tag", () => {
  installTheme(document);
  installTheme(document);
  const tags = document.querySelectorAll("#victory-theme");
  expect(tags.length).toBe(1);
  expect(tags[0].textContent).toBe(themeCss());
});

test("no colour lives anywhere else: index.css has no palette, index.html matches the theme file", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");
  expect(css).not.toMatch(/--victory-[a-z-]+:\s*\d/);
  const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
  expect(html).toContain(`media="(prefers-color-scheme: light)" content="${light.bg}"`);
  expect(html).toContain(`media="(prefers-color-scheme: dark)" content="${dark.bg}"`);
});

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test.each([["light", light], ["dark", dark]])("%s mode stays readable", (_, p) => {
  expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(7);
  expect(contrast(p.text, p.card)).toBeGreaterThanOrEqual(7);
  expect(contrast(p.muted, p.bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(p.lime, p.bg)).toBeGreaterThanOrEqual(4.5);
});
