// Contact-sync matching, privacy-preserving: the OS Contact Picker API hands us only
// the contacts the user explicitly selects (no background/full address-book access),
// and we hash each email client-side before it ever leaves the device — the backend
// only ever sees SHA-256 hashes, never raw names or emails of the user's contacts.
//
// Contact Picker API support is currently Chromium-only (Android/desktop Chrome, Edge) —
// no iOS Safari/WKWebView support, so this is unavailable in the native iOS app's webview
// and on desktop Safari/Firefox. contactsSupported() feature-detects rather than assuming.
export function contactsSupported() {
  return typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;
}

async function sha256Hex(str) {
  const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Opens the OS contact picker, returns SHA-256 hashes of the emails on the contacts the
// user picked. Throws if the user cancels the picker or denies the prompt — callers should
// catch and silently no-op on cancel rather than showing an error for a normal dismissal.
export async function pickContactEmailHashes() {
  const contacts = await navigator.contacts.select(["email"], { multiple: true });
  const emails = contacts
    .flatMap((c) => c.email || [])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const uniqueEmails = [...new Set(emails)];
  return Promise.all(uniqueEmails.map(sha256Hex));
}
