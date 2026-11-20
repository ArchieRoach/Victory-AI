// The corner orb: your partner's presence during a training session (rebuilt from the Lottie
// brief: a glowing orb that idles, swells while it listens or talks, and turns colour with dots
// circling while it thinks).
// Goal: the session feels coached, not timed, so people finish their rounds (completion).
// Psychology: a presence that reacts in real time feels like someone in your corner (social
//   facilitation: we work harder when someone is with us). Each state means something true, so
//   it never shows "thinking" unless the round really is being looked at.
// Design: no words on it. It glows with the coach's real voice, breathes while the camera counts,
//   cools to teal at rest, turns orange with circling dots while your round feedback is made, and
//   dims when paused. Big and calm, so you can read it from across the room.
export function orbMood({ thinking, speaking, paused, resting, watching, complete } = {}) {
  if (complete) return "rest";
  if (thinking) return "think";
  if (speaking) return "talk";
  if (paused) return "paused";
  if (resting) return "rest";
  if (watching) return "watch";
  return "ready";
}

export const MOOD_TONE = { talk: "lime", watch: "lime", ready: "teal", rest: "teal", think: "orange", paused: "muted" };
