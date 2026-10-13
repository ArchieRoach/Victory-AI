// Guards the onboarding rule (CLAUDE.md): make new fighters feel smart, never swamped.
// Few questions, no promises we can't keep, and features unlock after real sessions.
import fs from "fs";
import path from "path";

const src = fs.readFileSync(path.join(__dirname, "../pages/OnboardingFlow.jsx"), "utf8");

test("onboarding keeps to a handful of questions", () => {
  const q = Number(/const totalQuestions = (\d+);/.exec(src)[1]);
  const p = Number(/const totalPartnerSteps = (\d+);/.exec(src)[1]);
  expect(q).toBeLessThanOrEqual(4);
  expect(p).toBeLessThanOrEqual(2);
});

test("onboarding makes no result promises", () => {
  expect(src).not.toMatch(/like a pro within|double the|change everything|2x more/i);
});

test("onboarding never shows the advanced features", () => {
  expect(src).not.toMatch(/Boss Round|Golden Gloves|combo calls|Go live/i);
});
