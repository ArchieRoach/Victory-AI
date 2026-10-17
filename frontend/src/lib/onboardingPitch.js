import { normaliseGoal } from "@/lib/goals";

// Sign-up is the sales conversation (Hormozi's CLOSER): Clarify why they're here, Label it
// back to them, Overview what held them back (and that it isn't their fault), Sell the
// destination (their plan) rather than the plane ride (features), Explain away concerns,
// Reinforce the decision. Every line is built from their own answers; nothing promises a
// result we can't prove (CLAUDE.md onboarding rule).

const GOAL_PHRASE = {
  "Get fitter": "get fitter",
  "Get better overall": "get better at boxing",
  "Improve my defence": "tighten up your defence",
  "Sharpen my attack": "sharpen your attack",
  "Get ready to spar": "get ready to spar",
  "Compete in fights": "get ready to compete",
  "Just for fun": "enjoy your boxing more",
};

const HELD_BACK = {
  no_feedback: "nobody telling you what you're doing wrong",
  bad_habits: "the same bad habits coming back",
  defense_weak: "a defence that lets too much through",
  no_power: "punches without the power you want",
  footwork: "footwork that gets sloppy",
};

const FOCUS = {
  no_feedback: "technique",
  bad_habits: "your habits",
  defense_weak: "defence",
  no_power: "power",
  footwork: "footwork",
};

export const goalPhrase = (goal) => GOAL_PHRASE[normaliseGoal(goal)];
export const focusOf = (frustration) => FOCUS[frustration] || "technique";

// L + O: reflect their answers as a question, then take the blame off them.
export function labelLines(answers = {}) {
  const goal = goalPhrase(answers.primary_goal);
  const held = HELD_BACK[answers.biggest_frustration];
  const reflect = held
    ? `So it sounds like you want to ${goal}, and ${held} has been getting in the way. Does that sound about right?`
    : `So it sounds like you want to ${goal}. Does that sound about right?`;
  const notYourFault = answers.biggest_frustration === "no_feedback" || !held
    ? "That's not on you. Most people train with nobody watching their technique. That's the missing piece."
    : "That's not on you. It's hard to fix what nobody points out while you're doing it. That's the missing piece.";
  return { reflect, notYourFault };
}

// S: the destination, as a plan made of things the app really does.
export function planLines(answers = {}, partner = "Your partner") {
  const focus = focusOf(answers.biggest_frustration);
  const beginner = answers.experience_level === "complete_beginner";
  return {
    headline: `Your plan to ${goalPhrase(answers.primary_goal)}`,
    steps: [
      { when: "This week", what: `${beginner ? "Short, simple rounds" : "Rounds at your level"}. ${partner} talks you through each one and watches your ${focus}.` },
      { when: "Every round", what: "Turn on video and the AI scores 16 parts of your boxing, so you see exactly what to work on." },
      { when: "Week by week", what: `Combos get harder as you land them, and your homework drills follow your ${focus}.` },
    ],
  };
}
