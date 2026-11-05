import { previousStep, cleanFighterName } from "./onboardingBack";

const totals = { totalQuestions: 4, totalPartnerSteps: 2 };

describe("onboarding Back button", () => {
  test("every step but the first can go back one", () => {
    expect(previousStep({ phase: "birth_date" }, totals)).toBeNull();
    expect(previousStep({ phase: "affirmation" }, totals)).toEqual({ phase: "birth_date" });
    expect(previousStep({ phase: "why_hook", currentQuestion: 0 }, totals)).toEqual({ phase: "affirmation" });
    expect(previousStep({ phase: "why_hook", currentQuestion: 3 }, totals)).toEqual({ phase: "why_hook", currentQuestion: 2 });
    expect(previousStep({ phase: "personalized" }, totals)).toEqual({ phase: "why_hook", currentQuestion: 3 });
    expect(previousStep({ phase: "partner", currentPartnerStep: 0 }, totals)).toEqual({ phase: "personalized" });
    expect(previousStep({ phase: "partner", currentPartnerStep: 1 }, totals)).toEqual({ phase: "partner", currentPartnerStep: 0 });
    expect(previousStep({ phase: "naming" }, totals)).toEqual({ phase: "partner", currentPartnerStep: 1 });
  });

  test("no Back once the partner is made or while a screen is animating", () => {
    for (const phase of ["generating", "plan_building", "your_plan"]) expect(previousStep({ phase }, totals)).toBeNull();
  });
});

describe("typing your own coach", () => {
  test("takes real names and tidies spacing", () => {
    expect(cleanFighterName("  Dmitry   Bivol ")).toBe("Dmitry Bivol");
    expect(cleanFighterName("Naseem Hamed")).toBe("Naseem Hamed");
    expect(cleanFighterName("Ruiz Jr.")).toBe("Ruiz Jr.");
  });
  test("refuses blanks, one letter, links and long text", () => {
    expect(cleanFighterName("")).toBeNull();
    expect(cleanFighterName("A")).toBeNull();
    expect(cleanFighterName("http://x.com")).toBeNull();
    expect(cleanFighterName("a".repeat(41))).toBeNull();
  });
});
