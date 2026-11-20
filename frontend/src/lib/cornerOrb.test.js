import { MOOD_TONE, orbMood } from "./cornerOrb";

test("the orb shows what is really happening, most important first", () => {
  expect(orbMood({ thinking: true, speaking: true })).toBe("think");
  expect(orbMood({ speaking: true, resting: true })).toBe("talk");
  expect(orbMood({ paused: true, watching: true })).toBe("paused");
  expect(orbMood({ resting: true })).toBe("rest");
  expect(orbMood({ watching: true })).toBe("watch");
  expect(orbMood({})).toBe("ready");
  expect(orbMood({ complete: true, speaking: true })).toBe("rest");
});

test("every mood has a theme colour", () => {
  ["talk", "watch", "ready", "rest", "think", "paused"].forEach((m) => expect(MOOD_TONE[m]).toBeTruthy());
});
