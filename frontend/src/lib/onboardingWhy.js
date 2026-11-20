import { tx } from "@/i18n/tx";
import { goalLabel } from "@/lib/goals";

// Personalised first-run explanations: one short line under each question saying why we ask,
// using what they've already told us. Knowing why makes a question feel like coaching, not a form.
const WEAK_SPOT = { no_feedback: "real feedback", bad_habits: "bad habits", defense_weak: "defence", no_power: "power", footwork: "footwork" };
export function whyWeAsk(id, answers = {}) {
  const spot = WEAK_SPOT[answers.biggest_frustration] && tx(`lib.why.spot.${answers.biggest_frustration}`, WEAK_SPOT[answers.biggest_frustration]);
  switch (id) {
    case "primary_goal": return tx("lib.why.goal", "Your plan is built around this. You can change it any time.");
    case "biggest_frustration": return answers.primary_goal
      ? tx("lib.why.frustrationGoal", "Good. Your first rounds go straight at this, on the way to \"{{goal}}\".", { goal: goalLabel(answers.primary_goal).toLowerCase() })
      : tx("lib.why.frustration", "Your first rounds start with whatever you pick here.");
    case "experience_level": return spot ? tx("lib.why.levelSpot", "Good pick on {{spot}}. Your level sets how quickly new drills arrive.", { spot }) : tx("lib.why.level", "Your level sets how quickly new drills arrive.");
    case "boxing_stance": return answers.experience_level === "complete_beginner"
      ? tx("lib.why.stanceBeginner", "Not sure is a fine answer. It tells the AI which hand is your lead.")
      : tx("lib.why.stance", "It tells the AI which hand is your lead, so it reads your jab and cross the right way round.");
    case "favorite_fighter": return tx("lib.why.fighter", "Your partner will point it out when you do something they were famous for.");
    case "training_partner_style": return tx("lib.why.style", "This is how your partner talks to you. You can change it any time.");
    case "focus_areas": return spot ? tx("lib.why.focusSpot", "Pick up to 2. {{spot}} is a good place to start.", { spot: `${spot[0].toUpperCase()}${spot.slice(1)}` }) : tx("lib.why.focus", "Pick up to 2. Your partner watches these first.");
    default: return null;
  }
}
