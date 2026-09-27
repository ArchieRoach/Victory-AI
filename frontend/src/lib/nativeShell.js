// The iOS app loads this site in a WKWebView that appends "VictoryAI-iOS" to the user
// agent (ios/VictoryAI/App/MainAppView.swift). App Store Guideline 3.1.1 forbids buying
// digital goods through Stripe inside the app, so every purchase surface checks this.
export const NATIVE_SHELL_UA = "VictoryAI-iOS";

export const isNativeShell = () =>
  typeof navigator !== "undefined" && navigator.userAgent.includes(NATIVE_SHELL_UA);
