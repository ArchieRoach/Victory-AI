// Personalised first-run explanations: one short line under each question saying why we ask,
// using what they've already told us. Knowing why makes a question feel like coaching, not a form.
const WEAK_SPOT = { no_feedback: "real feedback", bad_habits: "bad habits", defense_weak: "defence", no_power: "power", footwork: "footwork" };
export function whyWeAsk(id, answers = {}) {
  const spot = WEAK_SPOT[answers.biggest_frustration];
  switch (id) {
    case "biggest_frustration": return "Your first rounds start with whatever you pick here.";
    case "experience_level": return spot ? `Good pick on ${spot}. Your level sets how quickly new drills arrive.` : "Your level sets how quickly new drills arrive.";
    case "boxing_stance": return answers.experience_level === "complete_beginner"
      ? "Not sure is a fine answer. It tells the AI which hand is your lead."
      : "It tells the AI which hand is your lead, so it reads your jab and cross the right way round.";
    case "favorite_fighter": return "Your partner will point it out when you do something they were famous for.";
    case "training_partner_style": return "This is how your partner talks to you. You can change it any time.";
    case "focus_areas": return spot ? `Pick up to 2. ${spot[0].toUpperCase()}${spot.slice(1)} is a good place to start.` : "Pick up to 2. Your partner watches these first.";
    default: return null;
  }
}
