import { isNativeShell } from "./nativeShell";

const setUA = (ua) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

test("detects the iOS shell user agent", () => {
  setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 VictoryAI-iOS");
  expect(isNativeShell()).toBe(true);
});

test("ordinary mobile Safari is not the shell", () => {
  setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1");
  expect(isNativeShell()).toBe(false);
});
