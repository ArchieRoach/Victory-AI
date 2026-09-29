import { shareVideoFile, highlightCaption, canShareFile } from "./shareVideo";

const file = new File(["x"], "clip.mp4", { type: "video/mp4" });

afterEach(() => {
  delete navigator.canShare;
  delete navigator.share;
});

test("shares the file through the OS sheet when supported", async () => {
  navigator.canShare = jest.fn(() => true);
  navigator.share = jest.fn(() => Promise.resolve());
  await expect(shareVideoFile(file, { text: "hi" })).resolves.toBe("shared");
  expect(navigator.share).toHaveBeenCalledWith({ files: [file], title: undefined, text: "hi" });
});

test("a dismissed share sheet is reported as cancelled, not an error", async () => {
  navigator.canShare = () => true;
  navigator.share = () => Promise.reject(Object.assign(new Error("no"), { name: "AbortError" }));
  await expect(shareVideoFile(file)).resolves.toBe("cancelled");
});

test("falls back to a download where file sharing is unsupported", async () => {
  URL.createObjectURL = jest.fn(() => "blob:x");
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  expect(canShareFile(file)).toBe(false);
  await expect(shareVideoFile(file)).resolves.toBe("downloaded");
  expect(click).toHaveBeenCalled();
  click.mockRestore();
});

test("caption leads with the reaction count when there is one", () => {
  expect(highlightCaption({ peak_reactions: 42 })).toMatch(/^42 reactions at once/);
  expect(highlightCaption({})).toMatch(/^Caught this live/);
});

test("training captions brag about the score and the improvement", () => {
  expect(highlightCaption({ source: "training", round_score: 8.4, score_delta: 0.6 })).toMatch(/^AI score 8\.4 \(\+0\.6\)/);
  expect(highlightCaption({ source: "training", round_score: 8.4, score_delta: -0.2 })).toMatch(/^AI score 8\.4 on/);
});
