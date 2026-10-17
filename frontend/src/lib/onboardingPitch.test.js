import { labelLines, planLines, goalPhrase } from "./onboardingPitch";
import { verbalCue, withCue, VERBAL_CUES } from "./verbalCues";

test("label reflects their own goal and what held them back, as a question", () => {
  const l = labelLines({ primary_goal: "Get fitter", biggest_frustration: "footwork" });
  expect(l.reflect).toBe("So it sounds like you want to get fitter, and footwork that gets sloppy has been getting in the way. Does that sound about right?");
  expect(l.notYourFault).toMatch(/^That's not on you/);
});

test("old or missing goals still read naturally", () => {
  expect(goalPhrase("Win a world title")).toBe("get ready to compete");
  expect(goalPhrase(undefined)).toBe("get better at boxing");
});

test("the plan sells the destination using only things the app really does", () => {
  const p = planLines({ primary_goal: "Get ready to spar", biggest_frustration: "defense_weak", experience_level: "3_plus_years" }, "Dee");
  expect(p.headline).toBe("Your plan to get ready to spar");
  expect(p.steps[0].what).toBe("Rounds at your level. Dee talks you through each one and watches your defence.");
  expect(p.steps.map((s) => s.what).join(" ")).not.toMatch(/guarantee|within \d+ days|double|\d+%/i);
});

test("verbal cues are steady for the same moment and come from the list", () => {
  expect(verbalCue("label")).toBe(verbalCue("label"));
  expect(VERBAL_CUES).toContain(verbalCue("x"));
  expect(withCue("Does that sound right?", "s")).toMatch(/^(Right\.|Okay\.|Hmm\.|Ahh, okay\.|Interesting\.|Really\?) Does/);
});
