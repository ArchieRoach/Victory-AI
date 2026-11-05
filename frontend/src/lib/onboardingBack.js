// Where the onboarding "Back" button goes from each step.
// Goal: people finish onboarding feeling in control (completion rate, and trust in the answers).
// Psychology: a visible way back lowers the cost of every tap (people commit faster when a choice
//   is reversible), and fixing a wrong answer beats quitting the flow.
// Design: one Back button in the header on every step except the first. It skips the animated
//   "building your partner" screens and stops before anything is saved for good (the partner is
//   created when they name it, so the plan screen has no Back).
export function previousStep({ phase, currentQuestion = 0, currentPartnerStep = 0 }, { totalQuestions, totalPartnerSteps }) {
  switch (phase) {
    case "affirmation":
      return { phase: "birth_date" };
    case "why_hook":
      return currentQuestion > 0 ? { phase, currentQuestion: currentQuestion - 1 } : { phase: "affirmation" };
    case "personalized":
      return { phase: "why_hook", currentQuestion: totalQuestions - 1 };
    case "partner":
      return currentPartnerStep > 0
        ? { phase, currentPartnerStep: currentPartnerStep - 1 }
        : { phase: "personalized" };
    case "naming":
      return { phase: "partner", currentPartnerStep: totalPartnerSteps - 1 };
    default:
      return null; // birth_date (first step), the animated screens, and the plan (partner already made)
  }
}

// "Someone else" on the coach question: a real boxer's name, typed in.
export function cleanFighterName(text) {
  const name = (text || "").replace(/\s+/g, " ").trim();
  return /^[\p{L}][\p{L} .'-]{1,39}$/u.test(name) ? name : null;
}
