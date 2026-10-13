// Guards optical icon alignment (DESIGN.md §10): every icon the app imports has been measured, every
// nudge is a 3–6% optical correction, and the CSS matches the measurements.
import fs from "fs";
import path from "path";
import optics from "./opticalIcons.json";

const { nudge, css, MIN, MAX } = require("../../scripts/measure-icon-optics");
const SRC = path.join(__dirname, "..");

function importedIcons() {
  const names = new Set();
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?)$/.test(e.name)) {
      for (const m of fs.readFileSync(p, "utf8").matchAll(/import \{([^}]*)\} from "lucide-react"/g)) {
        m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((n) => names.add(n));
      }
    }
  });
  walk(SRC);
  return [...names];
}

test("every nudge is a 3–6% optical correction", () => {
  for (const [cls, [x, y]] of Object.entries(optics.nudges)) {
    for (const v of [x, y]) {
      if (v !== 0) {
        expect(Math.abs(v)).toBeGreaterThanOrEqual(MIN);
        expect(Math.abs(v)).toBeLessThanOrEqual(MAX);
      }
    }
    expect(x || y).toBeTruthy();
    expect(cls).toMatch(/^lucide-/);
  }
  expect(nudge(2.9)).toBe(0);
  expect(nudge(-4.2)).toBe(-4.2);
  expect(nudge(13.3)).toBe(6);
});

test("the play triangle moves right, toward the middle of its box", () => {
  expect(optics.nudges["lucide-play"][0]).toBeGreaterThan(0);
  expect(optics.nudges["lucide-loader-circle"]).toBeUndefined();
});

test("index.css carries exactly the measured nudges", () => {
  const cssText = fs.readFileSync(path.join(SRC, "index.css"), "utf8");
  expect(cssText).toContain(css(optics.nudges));
});

test("every icon the app imports has been measured (run: node scripts/measure-icon-optics.js)", () => {
  const missing = importedIcons().filter((n) => !optics.measured.includes(n));
  expect(missing).toEqual([]);
});
