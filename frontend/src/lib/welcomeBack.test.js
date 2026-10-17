import { welcomeBackLines } from "./welcomeBack";

test("welcome back replays what they built, using only real numbers", () => {
  const l = welcomeBackLines({ days_away: 12, sessions: 14, best_overall: 7.8, badge: "First Hour", squad_sessions: 9 }, "Archie");
  expect(l.headline).toBe("Good to see you, Archie. 12 days away, nothing lost.");
  expect(l.built).toBe("You've built 14 sessions, a best score of 7.8 and the First Hour badge. It's all still here.");
  expect(l.missed).toBe("Your squad trained 9 times while you were away.");
});

test("missing numbers are left out, never made up", () => {
  const l = welcomeBackLines({ days_away: 8, sessions: 1, best_overall: null, badge: null, squad_sessions: 0 });
  expect(l.built).toBe("You've built 1 session. It's all still here.");
  expect(l.missed).toBeNull();
});
