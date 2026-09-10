// Early crash reporting — catches what would otherwise be a silent blank screen (a
// provider throwing mid-render, an unhandled promise rejection) and gets it in front of
// someone fast, before a user even has to notice and file feedback about it.
//
// Uses plain fetch(), not axios: if something in the app's own request layer is part of
// what's broken, the report still has to go out. Matches App.js's own `API` constant
// exactly, but reconstructed locally (not imported) to avoid a circular import — this
// module is installed from App.js's own top level.
const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

// De-dupe within a page session — a render loop or a repeating async error shouldn't
// turn into dozens of identical reports for the same underlying crash.
const reported = new Set();

export function reportCrash({ message, stack, componentStack, source = "window" }) {
  const key = `${source}:${message}:${(stack || "").slice(0, 200)}`;
  if (reported.has(key)) return;
  reported.add(key);

  try {
    fetch(`${API_BASE}/crash-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: String(message || "Unknown error").slice(0, 2000),
        stack: stack ? String(stack).slice(0, 8000) : null,
        component_stack: componentStack ? String(componentStack).slice(0, 8000) : null,
        url: window.location.href,
        user_agent: navigator.userAgent,
        source,
      }),
      keepalive: true, // let the request finish even if the page is about to unload
    }).catch(() => {});
  } catch {
    // Reporting a crash must never itself throw and mask the original error.
  }
}

let installed = false;

// Catches errors outside React's render cycle (event handlers, timers, async code) —
// React error boundaries do not see these at all. Call once, at app startup.
export function installGlobalCrashReporting() {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    reportCrash({
      message: event.message,
      stack: event.error?.stack,
      source: "window",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportCrash({
      message: reason?.message || String(reason),
      stack: reason?.stack,
      source: "promise",
    });
  });
}
