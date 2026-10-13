// Multimodal feedback, used sparingly (Apple: causality, harmony, utility).
// Only for meaningful moments: a real win (success), a sheet snapping shut (snap), a problem
// (warning). Fired on the same frame as the visual change it belongs to. In the App Store app
// it uses the iPhone's Taptic Engine; on Android it uses vibration; elsewhere it does nothing.
const PATTERNS = { success: [12, 40, 18], snap: 8, warning: [20, 60, 20], selection: 5 };

export function haptic(kind = "selection") {
  if (!PATTERNS[kind]) return;
  try {
    const native = typeof window !== "undefined" && window.webkit?.messageHandlers?.victoryHaptic;
    if (native) { Promise.resolve(native.postMessage({ action: kind })).catch(() => {}); return; }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(PATTERNS[kind]);
  } catch {}
}
