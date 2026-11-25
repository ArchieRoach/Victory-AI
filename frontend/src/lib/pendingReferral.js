// A /r/CODE link opened while signed out has to survive the trip through sign-up.
const KEY = "victory_pending_referral";
const VALID = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

export function savePendingReferral(code) {
  const c = String(code || "").toUpperCase();
  if (!VALID.test(c)) return;
  try { localStorage.setItem(KEY, c); } catch {}
}

export function takePendingReferral() {
  try {
    const c = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    return c && VALID.test(c) ? c : null;
  } catch {
    return null;
  }
}

// Text links that open a messaging app with the invite already written.
export function whatsappLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function smsLink(text, numbers = []) {
  const to = numbers.map((n) => String(n).replace(/[^\d+]/g, "")).filter(Boolean).join(",");
  const iOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent || "");
  return `sms:${to}${iOS ? "&" : "?"}body=${encodeURIComponent(text)}`;
}
