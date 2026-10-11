import { QUESTIONS, STYLES, scoreStyle, styleShareText } from "./fighterStyle";

const DIMENSIONS = ["Jab", "Cross", "Left Hook", "Right Hook", "Uppercut", "Combination Flow", "Punch Balance", "Punch Accuracy",
  "Guard Position", "Head Movement", "Slip", "Roll", "Parry", "Body Movement", "Footwork", "Ring Generalship"];

test("every style focuses on real scored dimensions and every answer points somewhere real", () => {
  Object.values(STYLES).forEach((s) => s.focus.forEach((d) => expect(DIMENSIONS).toContain(d)));
  QUESTIONS.forEach((q) => q.a.forEach(([, w]) => Object.keys(w).forEach((k) => expect(STYLES[k]).toBeDefined())));
});

test("clear answers give the matching style", () => {
  expect(scoreStyle([2, 2, 0, 3, 3, 3])).toBe("counter");
  expect(scoreStyle([3, 3, 2, 2, 1, 0])).toBe("power");
  expect(scoreStyle([1, 0, 1, 0, 0, 2])).toBe("outboxer");
});

test("every style can be reached", () => {
  const reached = new Set();
  const walk = (i, picks) => {
    if (i === QUESTIONS.length) { reached.add(scoreStyle(picks)); return; }
    QUESTIONS[i].a.forEach((_, c) => walk(i + 1, [...picks, c]));
  };
  walk(0, []);
  expect([...reached].sort()).toEqual(Object.keys(STYLES).sort());
});

test("share text names the style and the legend", () => {
  expect(styleShareText("pressure")).toBe("I'm a Pressure Fighter, like Joe Frazier. What kind of fighter are you?");
});
