// The Victory AI mascot (pitbull in the belt), animated with a boxing twist on the Duolingo-style
// brief: the owl's fly-in, hover and land become a ring walk-in, bouncing on his toes, and a jab.
// Goal: a first impression with personality, so the brand feels like a fighter, not an app icon.
// Psychology: a character that moves like the thing it stands for is remembered (the Duo effect);
//   play invites a tap, and the tap answers with a one-two, which feels alive (responsiveness).
// Design: one picture, so the whole fighter moves (no puppet rig): drop in over the ropes with a
//   squash on landing, the title slams in like a fight card, then a loop of bouncing on his toes
//   and a slow bob-and-weave, a shine across the belt, and a jab with an impact flash now and then.
//   Reduced motion: just the picture and the title, still.

// Where things are on the picture (fractions of its width/height), for the effects on top.
export const SPOTS = {
  leftGlove: { x: 0.24, y: 0.31 },
  rightGlove: { x: 0.78, y: 0.31 },
  belt: { top: 0.49, height: 0.27, left: 0.23, width: 0.53 },
};

export const ENTER_MS = 900;
export const IDLE_JAB_EVERY_MS = 7000;
export const GLINT_EVERY_MS = 4500;

export const KEYFRAMES = {
  dropIn: [
    { transform: "translateY(-120%) scale(0.92, 1.08)", opacity: 0, offset: 0 },
    { transform: "translateY(-120%) scale(0.92, 1.08)", opacity: 1, offset: 0.05 },
    { transform: "translateY(0) scale(0.96, 1.06)", offset: 0.62, easing: "ease-out" },
    { transform: "translateY(2%) scale(1.07, 0.9)", offset: 0.72, easing: "ease-out" },
    { transform: "translateY(-3%) scale(0.98, 1.03)", offset: 0.86, easing: "ease-in-out" },
    { transform: "translateY(0) scale(1, 1)", offset: 1 },
  ],
  shadowIn: [
    { transform: "scale(0.3)", opacity: 0 },
    { transform: "scale(0.8)", opacity: 0.6, offset: 0.62 },
    { transform: "scale(1.15)", opacity: 0.9, offset: 0.72 },
    { transform: "scale(1)", opacity: 0.75 },
  ],
  ropes: [
    { transform: "translateY(0)" }, { transform: "translateY(7px)", offset: 0.25 },
    { transform: "translateY(-4px)", offset: 0.5 }, { transform: "translateY(2px)", offset: 0.75 },
    { transform: "translateY(0)" },
  ],
  dust: [
    { transform: "scale(0.4)", opacity: 0.7 },
    { transform: "scale(1.6)", opacity: 0 },
  ],
  titleSlam: [
    { transform: "scale(1.8)", opacity: 0, offset: 0 },
    { transform: "scale(0.94)", opacity: 1, offset: 0.55, easing: "ease-out" },
    { transform: "scale(1.03) rotate(-1deg)", offset: 0.7 },
    { transform: "scale(1) rotate(1deg)", offset: 0.82 },
    { transform: "scale(1) rotate(0)", opacity: 1, offset: 1 },
  ],
  jabLeft: [
    { transform: "translate(0, 0) rotate(0) scale(1)" },
    { transform: "translate(-4%, -2%) rotate(-4deg) scale(1.07)", offset: 0.35, easing: "ease-out" },
    { transform: "translate(0, 0) rotate(0) scale(1)" },
  ],
  jabRight: [
    { transform: "translate(0, 0) rotate(0) scale(1)" },
    { transform: "translate(4%, -2%) rotate(4deg) scale(1.08)", offset: 0.35, easing: "ease-out" },
    { transform: "translate(0, 0) rotate(0) scale(1)" },
  ],
  impact: [
    { transform: "translate(-50%, -50%) scale(0.2) rotate(0deg)", opacity: 0 },
    { transform: "translate(-50%, -50%) scale(1.1) rotate(15deg)", opacity: 1, offset: 0.35 },
    { transform: "translate(-50%, -50%) scale(1.4) rotate(25deg)", opacity: 0 },
  ],
  glint: [
    { transform: "translateX(-120%) skewX(-20deg)" },
    { transform: "translateX(220%) skewX(-20deg)" },
  ],
};

// A tap throws a one-two: left jab, then right cross, each with its flash on that glove.
export const COMBO = [
  { move: "jabLeft", glove: "leftGlove", at: 0, ms: 260 },
  { move: "jabRight", glove: "rightGlove", at: 230, ms: 300 },
];
