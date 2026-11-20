import { canDigDeeper, firstName, next, toMessages } from "./partnerBuddy";

test("the flow goes idle, think, answer, did that help, and back", () => {
  let s = "idle";
  s = next(s, "ask"); expect(s).toBe("think");
  s = next(s, "answer"); expect(s).toBe("respond");
  s = next(s, "shown"); expect(s).toBe("feedback");
  expect(next(s, "no")).toBe("think");
  expect(next(s, "yes")).toBe("idle");
});

test("it only dozes off when nothing is happening, and a tap wakes it", () => {
  expect(next("think", "doze")).toBe("think");
  expect(next("respond", "doze")).toBe("respond");
  expect(next("idle", "doze")).toBe("sleep");
  expect(next("sleep", "ask")).toBe("sleep");
  expect(next("sleep", "wake")).toBe("idle");
});

test("no digs deeper once, then stops", () => {
  expect(canDigDeeper([{ role: "user", text: "hi" }])).toBe(true);
  expect(canDigDeeper([{ role: "assistant", bubbles: ["x"], deeper: true }])).toBe(false);
});

test("the chat is sent as plain turns", () => {
  expect(toMessages([{ role: "user", text: "Help" }, { role: "assistant", bubbles: ["One.", "Two."] }]))
    .toEqual([{ role: "user", text: "Help" }, { role: "assistant", text: "One.\n\nTwo." }]);
  expect(firstName({ display_name: "Lucas Ward" })).toBe("Lucas");
  expect(firstName({})).toBe("");
});

test("it checks in from the real week", () => {
  const { checkIn } = require("./partnerBuddy");
  const week = (pattern) => ({ week_activity: pattern.split("").map((c) => ({ active: c === "x" })) });
  expect(checkIn(week("......x"))).toBe("trainedToday");
  expect(checkIn(week("....x.."))).toBe("hello");
  expect(checkIn(week("..x...."))).toBe("missed");
  expect(checkIn(week("......."))).toBe("missed");
  expect(checkIn(null)).toBe("hello");
});
