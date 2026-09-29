// The fighter's own answer to "record rounds for AI scoring?", remembered on this device.
// Recording stays opt-in (high-privacy default for a teen audience); we just ask once,
// clearly, instead of hiding it behind a toggle.
const KEY = "victory_record_video";

export function getVideoPref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

export function setVideoPref(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
}
