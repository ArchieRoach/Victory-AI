import { nativePaywall } from "./nativeBridge";

afterEach(() => { delete window.webkit; });

test("Pro upgrades in the iOS app ask the native layer for Apple's paywall", async () => {
  const postMessage = jest.fn().mockResolvedValue({ shown: true });
  window.webkit = { messageHandlers: { victoryStore: { postMessage } } };
  await expect(nativePaywall()).resolves.toEqual({ shown: true });
  expect(postMessage).toHaveBeenCalledWith({ action: "paywall" });
});

test("on the web it quietly does nothing", async () => {
  await expect(nativePaywall()).resolves.toBeNull();
});
