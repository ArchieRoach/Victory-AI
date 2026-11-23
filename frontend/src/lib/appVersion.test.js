import { _resetVersionCheck, mainScriptIn, newerVersionLive, safeToReload } from "./appVersion";

const page = (hash) => `<html><script defer src="/static/js/main.${hash}.js"></script></html>`;

beforeEach(() => {
  _resetVersionCheck();
  document.head.innerHTML = '<script src="/static/js/main.aaaa1111.js"></script>';
});

test("it finds the app's main script in a page", () => {
  expect(mainScriptIn(page("bbbb2222"))).toBe("/static/js/main.bbbb2222.js");
  expect(mainScriptIn("<html></html>")).toBe(null);
});

test("a newer version live is noticed; the same version isn't", async () => {
  const same = jest.fn(() => Promise.resolve({ text: () => Promise.resolve(page("aaaa1111")) }));
  expect(await newerVersionLive({ now: 10_000_000, fetcher: same })).toBe(false);
  const newer = jest.fn(() => Promise.resolve({ text: () => Promise.resolve(page("bbbb2222")) }));
  expect(await newerVersionLive({ now: 10_000_000 + 60_000, fetcher: newer })).toBe(false);
  expect(newer).not.toHaveBeenCalled();
  expect(await newerVersionLive({ now: 10_000_000 + 6 * 60_000, fetcher: newer })).toBe(true);
});

test("it never reloads in the middle of training or a live stream", () => {
  expect(safeToReload("/train")).toBe(false);
  expect(safeToReload("/timer")).toBe(false);
  expect(safeToReload("/go-live")).toBe(false);
  expect(safeToReload("/home")).toBe(true);
  expect(safeToReload("/profile")).toBe(true);
});
