// The iOS app loads this site in a WKWebView that appends "VictoryAI-iOS" to the user
// agent (ios/VictoryAI/App/MainAppView.swift). App Store Guideline 3.1.1 forbids buying
// digital goods through Stripe inside the app, so every Stripe surface checks this. Pro
// upgrades still show: /paywall opens the App Store paywall instead (NativePaywallRoute).
export const NATIVE_SHELL_UA = "VictoryAI-iOS";

export const isNativeShell = () =>
  typeof navigator !== "undefined" && navigator.userAgent.includes(NATIVE_SHELL_UA);
