// Goal: the AI partner sounds like a coach who is listening, not a script reading out.
// Psychology: NEPQ-style verbal cues ("Right…", "Hmm…", "Okay…") before a question signal
//   active listening; people warm to someone who reflects them back, and a question
//   invites them to talk about themselves, which is rewarding in itself. Questions over
//   statements also avoid reactance: people argue with claims, not with their own answers.
// Design: one short cue, picked steadily from a seed so the same moment always reads the
//   same, in front of partner lines that reflect or ask. Never in combo calls (speed matters).
export const VERBAL_CUES = ["Right.", "Okay.", "Hmm.", "Ahh, okay.", "Interesting.", "Really?"];

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function verbalCue(seed = "") {
  return VERBAL_CUES[hash(seed) % VERBAL_CUES.length];
}

export function withCue(text, seed = text) {
  if (!text) return text;
  return `${verbalCue(seed)} ${text}`;
}
