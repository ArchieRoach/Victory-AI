import { GOALS, normaliseGoal, recordInput, recordNumber } from "./goals";

test("a short goal list everyone can pick from, with Get fitter first", () => {
  expect(GOALS.length).toBeLessThanOrEqual(7);
  expect(GOALS[0]).toBe("Get fitter");
});

test("old goals move to the nearest new one", () => {
  expect(normaliseGoal("Just having fun")).toBe("Just for fun");
  expect(normaliseGoal("Win a world title")).toBe("Compete in fights");
  expect(normaliseGoal("Build my following online")).toBe("Get better overall");
  expect(normaliseGoal("Get fitter")).toBe("Get fitter");
});

test("a fight record box can be emptied while typing, and saves as a number", () => {
  expect(recordInput("")).toBe("");
  expect(recordInput("012")).toBe("012");
  expect(recordInput("12a")).toBe("12");
  expect(recordInput("12345")).toBe("123");
  expect(recordNumber("")).toBe(0);
  expect(recordNumber("07")).toBe(7);
});
