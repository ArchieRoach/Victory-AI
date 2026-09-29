// Remembers what brought the fighter into the app this visit — a push of a given kind
// ("booking", "callout", …) via the ?src= every push link carries, or "direct" when they
// opened the app themselves. Sessions record it so we can see external triggers giving
// way to internal ones over time.
const KEY = "victory_entry";

const read = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
};

const write = (entry) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entry));
  } catch {}
};

// Called on every route change. Returns the search string with src removed, or null if
// there was nothing to strip.
export function noteEntry(search, now = Date.now()) {
  const params = new URLSearchParams(search);
  const src = params.get("src");
  if (src) {
    write({ src: src.replace(/[^a-z]/gi, "").slice(0, 20).toLowerCase() || "push", at: now });
    params.delete("src");
    const rest = params.toString();
    return rest ? `?${rest}` : "";
  }
  if (!read()) write({ src: "direct", at: now });
  return null;
}

export function currentEntry(now = Date.now()) {
  const entry = read() || { src: "direct", at: now };
  return { entry_source: entry.src, entry_age_minutes: Math.max(0, Math.round((now - entry.at) / 60_000)) };
}
