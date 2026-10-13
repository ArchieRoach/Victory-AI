import { canShow, claim, dismiss, release, activeTip, isSeen, shownToday, tipText, tipContext, DAILY_CAP, _reset } from "./coachMarks";
import { whyWeAsk } from "./onboardingWhy";

beforeEach(() => { localStorage.clear(); _reset(); });

test("one tip at a time, never while held, never twice, at most 3 a day", () => {
  expect(canShow({ id: "a", seen: false, active: null, shownToday: 0, held: false })).toBe(true);
  expect(canShow({ id: "a", seen: false, active: "b", shownToday: 0, held: false })).toBe(false);
  expect(canShow({ id: "a", seen: false, active: null, shownToday: 0, held: true })).toBe(false);
  expect(canShow({ id: "a", seen: true, active: null, shownToday: 0, held: false })).toBe(false);
  expect(canShow({ id: "a", seen: false, active: null, shownToday: DAILY_CAP, held: false })).toBe(false);
});

test("the shared queue hands tips out one by one and remembers what was seen", () => {
  expect(claim("home_one_round")).toBe(true);
  expect(claim("home_partner")).toBe(false);
  dismiss("home_one_round");
  expect(isSeen("home_one_round")).toBe(true);
  expect(claim("home_one_round")).toBe(false);
  expect(claim("home_partner")).toBe(true);
  release("home_partner");
  expect(activeTip()).toBe(null);
  claim("home_week_plan"); dismiss("home_week_plan");
  expect(shownToday()).toBe(DAILY_CAP);
  expect(claim("home_coming_up")).toBe(false);
});

test("tips speak to the fighter by name, with their partner and focus", () => {
  const ctx = tipContext({ name: "Archie Roach", training_partner: { name: "Dee", focus_areas: ["Footwork"] } });
  expect(tipText("home_one_round", ctx)).toBe("Archie, start here. One 3-minute round with Dee. That's your whole first session.");
  expect(tipText("train_video", ctx)).toMatch(/your footwork from what it actually sees/);
  expect(tipText("home_one_round", tipContext(null))).toBe("Start here. One 3-minute round with your partner. That's your whole first session.");
  expect(tipText("unknown_id", ctx, "fallback")).toBe("fallback");
});

test("onboarding explains why it asks, using earlier answers", () => {
  expect(whyWeAsk("experience_level", { biggest_frustration: "footwork" })).toBe("Good pick on footwork. Your level sets how quickly new drills arrive.");
  expect(whyWeAsk("boxing_stance", { experience_level: "complete_beginner" })).toMatch(/^Not sure is a fine answer/);
  expect(whyWeAsk("focus_areas", { biggest_frustration: "defense_weak" })).toBe("Pick up to 2. Defence is a good place to start.");
  expect(whyWeAsk("nope")).toBeNull();
});
