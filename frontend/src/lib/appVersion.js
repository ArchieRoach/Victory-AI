// Keeps people on the newest version. A tab left open for days kept running old code (old combos,
// the robot voice) after fixes went live. Now the app checks for a newer version now and then and
// reloads itself at a safe moment: when you move between screens or come back to the app, never
// in the middle of a training session.
const MAIN_RE = /\/static\/js\/main\.[0-9a-f]+\.js/;
const CHECK_EVERY_MS = 5 * 60 * 1000;
const UNSAFE_PATHS = [/^\/train/, /^\/timer/, /^\/go-live/, /^\/live\//];

export function mainScriptIn(html) {
  return (String(html || "").match(MAIN_RE) || [null])[0];
}

export function runningScript(doc = typeof document !== "undefined" ? document : null) {
  const el = doc?.querySelector?.('script[src*="/static/js/main."]');
  return el ? mainScriptIn(el.getAttribute("src")) : null;
}

export const safeToReload = (path) => !UNSAFE_PATHS.some((re) => re.test(path || ""));

let lastCheck = 0;
let stale = false;

export async function newerVersionLive({ now = Date.now(), fetcher = typeof fetch !== "undefined" ? fetch : null } = {}) {
  if (stale) return true;
  if (!fetcher || now - lastCheck < CHECK_EVERY_MS) return false;
  lastCheck = now;
  const running = runningScript();
  if (!running) return false;
  try {
    const res = await fetcher(`/index.html?v=${now}`, { cache: "no-store" });
    const live = mainScriptIn(await res.text());
    stale = !!live && live !== running;
  } catch {}
  return stale;
}

export const _resetVersionCheck = () => { lastCheck = 0; stale = false; };
