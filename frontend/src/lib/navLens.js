// The moving "lens" behind the selected tab (rebuilt from the Lottie brief: a bubble that slides
// to the new tab, swells while it travels, and settles).
// Goal: the bar feels alive and premium, and you always see where you came from and where you are.
// Psychology: motion that connects two states keeps people oriented (object constancy); a small
//   swell during travel reads as momentum, like a real object.
// Design: the lens rides a spring (lib/motion.js) from the old tab to the new one. Its size grows
//   with the distance still to go, so it is biggest mid-flight and exactly tab-sized at rest.
//   Each page draws its own bar, so the last tab is remembered between pages to start from there.
export const SWELL = 0.16;

let lastIndex = null;
export const rememberTab = (i) => { lastIndex = i; };
export const previousTab = () => lastIndex;

// 0 when the lens is on its tab, 1 when it's a full tab (or more) away.
export function travel(x, target, step) {
  if (!step) return 0;
  return Math.min(1, Math.abs(target - x) / step);
}

export function lensScale(x, target, step) {
  return 1 + SWELL * travel(x, target, step);
}
