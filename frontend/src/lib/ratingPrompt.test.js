import { shouldAskForRating, maybeAskForRating, RATING_ASKED_KEY, RATING_GAP_DAYS } from "./ratingPrompt";

const DAY = 24 * 60 * 60 * 1000;

describe("asking for an App Store rating", () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.webkit;
  });

  test("only after a real win, never in someone's first sessions", () => {
    expect(shouldAskForRating({ won: false, newcomer: false })).toBe(false);
    expect(shouldAskForRating({ won: true, newcomer: true })).toBe(false);
    expect(shouldAskForRating({ won: true, newcomer: false })).toBe(true);
  });

  test("at most once every 120 days", () => {
    const now = Date.now();
    expect(shouldAskForRating({ won: true, newcomer: false, lastAskedAt: now - 10 * DAY, now })).toBe(false);
    expect(shouldAskForRating({ won: true, newcomer: false, lastAskedAt: now - RATING_GAP_DAYS * DAY, now })).toBe(true);
  });

  test("does nothing on the website, asks the iPhone app once", () => {
    expect(maybeAskForRating({ won: true, newcomer: false })).toBe(false);
    const postMessage = jest.fn(() => Promise.resolve());
    window.webkit = { messageHandlers: { victoryStore: { postMessage } } };
    expect(maybeAskForRating({ won: true, newcomer: false })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ action: "review" });
    expect(localStorage.getItem(RATING_ASKED_KEY)).toBeTruthy();
    expect(maybeAskForRating({ won: true, newcomer: false })).toBe(false);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
