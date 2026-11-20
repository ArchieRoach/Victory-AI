// Guards the three walkthrough rules (lib/walkthrough.js): keep it short, go in the order people
// use the app, and only show it once there's something on screen.
import fs from "fs";
import path from "path";
import { MAX_STEPS, readySteps, walkthroughSteps, COVERS_TIPS } from "./walkthrough";

const steps = walkthroughSteps({ display_name: "Ana Lima", training_partner: { name: "Coach K" } });

test("rule 1: it stays short", () => {
  expect(steps.length).toBeLessThanOrEqual(MAX_STEPS);
  expect(MAX_STEPS).toBeLessThanOrEqual(4);
  for (const s of steps) expect(s.body.length).toBeLessThanOrEqual(140);
});

test("rule 2: steps go in the order people use the app (first round first, help last)", () => {
  expect(steps.map((s) => s.target)).toEqual(["one-round", "partner-condition", "nav-train", "help-button"]);
  expect(steps[0].body).toMatch(/Coach K/);
});

test("rule 3: nothing on screen means no walkthrough yet", () => {
  expect(readySteps(steps, () => false)).toBeNull();
  expect(readySteps(steps, (id) => id !== "one-round")).toBeNull();
  const some = readySteps(steps, (id) => id !== "partner-condition");
  expect(some.map((s) => s.target)).toEqual(["one-round", "nav-train", "help-button"]);
});

test("every step points at a real button that exists in the app", () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const all = ["components/home/OneRoundButton.jsx", "components/PartnerCondition.jsx", "components/BottomNav.jsx", "components/FeedbackWidget.jsx"].map(src).join("\n");
  expect(all).toMatch(/data-testid="one-round"/);
  expect(all).toMatch(/data-testid="partner-condition"/);
  expect(all).toMatch(/data-testid=\{`nav-\$\{key\}`\}/);
  expect(all).toMatch(/key: "train"/);
  expect(all).toMatch(/data-testid="help-button"/);
});

test("it replaces the Home tips it covers, so nothing is said twice", () => {
  expect(COVERS_TIPS).toEqual(["home_one_round", "home_partner"]);
});
