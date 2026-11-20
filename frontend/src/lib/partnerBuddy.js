// Your training partner as a little living character (rebuilt from the Lottie brief: an orb that
// idles, thinks, answers in bubbles, asks "did that help?", digs deeper on "no", and dozes off
// until you tap it).
// Goal: a coach in your corner between sessions, so people come back and train (retention).
// Psychology: a character that reacts feels like a relationship, not a tool (the Duo effect);
//   being asked "did that help?" and seeing "no" taken seriously makes people feel heard; a
//   sleeping buddy that wakes when tapped invites play without nagging.
// Design: it's your partner, by name, talking like a coach. It never calls itself "AI", but it
//   never pretends to be a person either (the backend makes it say so if asked), and every
//   number it uses is real (backend/partner_chat.py).
export const SLEEP_AFTER_MS = 45000;
export const BUBBLE_GAP_MS = 650;

export const STATES = ["idle", "think", "respond", "feedback", "sleep"];

const NEXT = {
  idle: { ask: "think", doze: "sleep" },
  think: { answer: "respond", fail: "respond" },
  respond: { shown: "feedback", ask: "think" },
  feedback: { yes: "idle", no: "think", ask: "think", doze: "sleep" },
  sleep: { wake: "idle" },
};

// Anything not listed keeps the current state, so a stray tap can't break the flow.
export function next(state, event) {
  return NEXT[state]?.[event] || state;
}

// "No" digs deeper once. A second "no" hands control back instead of looping.
export function canDigDeeper(thread) {
  return !thread.some((m) => m.deeper);
}

export function firstName(user) {
  const n = String(user?.display_name || user?.name || "").trim();
  return n.split(/\s+/)[0] || "";
}

// What the API needs: the chat so far, oldest first, with answers joined back into one turn.
export function toMessages(thread) {
  return thread.map((m) => ({ role: m.role, text: m.role === "assistant" ? m.bubbles.join("\n\n") : m.text }));
}
