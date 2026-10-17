// Goal: people pick a goal in seconds and feel it fits them.
// Psychology: choice overload. Seventeen options, many about fame or world titles, made the
//   choice harder and told most fighters this app isn't for them. A short list everyone
//   recognises gets an answer, and "Get fitter" names the most common reason people box.
// Design: seven goals for every level. Old, longer goals map to the nearest new one.
export const GOALS = [
  "Get fitter",
  "Get better overall",
  "Improve my defence",
  "Sharpen my attack",
  "Get ready to spar",
  "Compete in fights",
  "Just for fun",
];

const OLD_TO_NEW = {
  "Improve defence": "Improve my defence",
  "Sharpen my offence": "Sharpen my attack",
  "Prepare for sparring": "Get ready to spar",
  "Just having fun": "Just for fun",
  "Compete in amateurs": "Compete in fights",
  "Go professional": "Compete in fights",
  "Win a regional / national title": "Compete in fights",
  "Fund my fight camp": "Compete in fights",
  "Climb the world rankings": "Compete in fights",
  "Earn a title shot": "Compete in fights",
  "Win a world title": "Compete in fights",
};

export function normaliseGoal(goal) {
  if (GOALS.includes(goal)) return goal;
  return OLD_TO_NEW[goal] || "Get better overall";
}

// Fight records: the box may be empty while typing (so the 0 can be deleted); it's saved as a number.
export const recordInput = (raw) => String(raw ?? "").replace(/\D/g, "").slice(0, 3);
export const recordNumber = (raw) => Number(recordInput(raw)) || 0;
