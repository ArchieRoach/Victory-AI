import { NATIVE_SHELL_UA } from "./nativeShell";

// iPhone push has three routes: APNs through the App Store app, web push once the site is
// installed to the Home Screen (iOS 16.4+), and nothing at all in a Safari tab. In the tab
// the only useful thing to offer is the install step.
export function isIOS(ua = "", platform = "", touchPoints = 0) {
  return /iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

export function pushMode({ ua = "", platform = "", touchPoints = 0, standalone = false, webPush = false, nativeBridge = false } = {}) {
  if (ua.includes(NATIVE_SHELL_UA)) return nativeBridge ? "native" : "unsupported";
  if (webPush) return "web";
  if (isIOS(ua, platform, touchPoints) && !standalone) return "install-ios";
  return "unsupported";
}

export function currentPushMode() {
  if (typeof window === "undefined") return "unsupported";
  const nav = window.navigator;
  return pushMode({
    ua: nav.userAgent,
    platform: nav.platform,
    touchPoints: nav.maxTouchPoints || 0,
    standalone: nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches,
    webPush: "serviceWorker" in nav && "PushManager" in window && "Notification" in window,
    nativeBridge: !!window.webkit?.messageHandlers?.victoryPush,
  });
}
