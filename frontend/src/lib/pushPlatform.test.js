import { isIOS, pushMode } from "./pushPlatform";

const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const SHELL = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 VictoryAI-iOS";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";

test("detects iPhones and iPads that report a desktop UA", () => {
  expect(isIOS(SAFARI_IPHONE)).toBe(true);
  expect(isIOS(IPAD_DESKTOP_UA, "MacIntel", 5)).toBe(true);
  expect(isIOS(IPAD_DESKTOP_UA, "MacIntel", 0)).toBe(false);
  expect(isIOS(ANDROID)).toBe(false);
});

test("Safari tab on iPhone gets the install step, not a dead toggle", () => {
  expect(pushMode({ ua: SAFARI_IPHONE })).toBe("install-ios");
});

test("installed Home Screen app uses web push", () => {
  expect(pushMode({ ua: SAFARI_IPHONE, standalone: true, webPush: true })).toBe("web");
  expect(pushMode({ ua: SAFARI_IPHONE, standalone: true, webPush: false })).toBe("unsupported");
});

test("App Store app uses the native bridge when the build has it", () => {
  expect(pushMode({ ua: SHELL, nativeBridge: true })).toBe("native");
  expect(pushMode({ ua: SHELL, nativeBridge: false })).toBe("unsupported");
  expect(pushMode({ ua: SHELL, nativeBridge: false, webPush: true })).toBe("unsupported");
});

test("everyone else falls back to plain web push", () => {
  expect(pushMode({ ua: ANDROID, webPush: true })).toBe("web");
  expect(pushMode({ ua: ANDROID })).toBe("unsupported");
});
