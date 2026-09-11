import posthog from "posthog-js";

// Product analytics (PostHog), configured privacy-first for a GDPR / teen-majority
// audience:
//  - no cookies or localStorage identifiers (persistence: "memory") → no cookie
//    banner needed; identified users are re-stitched by identify() on login
//  - autocapture / session recording / surveys all OFF — we send explicit events only
//  - respects Do Not Track
//  - URLs are normalised (query strings dropped, id-ish path segments → ":id") so we
//    never log "user A looked at user B's profile"
//
// No-ops entirely when REACT_APP_POSTHOG_KEY is unset (local dev, self-hosters).

const KEY = process.env.REACT_APP_POSTHOG_KEY;
const HOST = process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com";

let enabled = false;

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d+|user_[A-Za-z0-9]+)$/i;

export function normalizePath(pathname = "") {
  return (
    pathname
      .split("/")
      .map((seg) => (ID_SEGMENT.test(seg) ? ":id" : seg))
      .join("/") || "/"
  );
}

export function initAnalytics() {
  if (enabled || !KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    persistence: "memory",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    disable_surveys: true,
    respect_dnt: true,
    advanced_disable_decide: true,
    before_send: (event) => {
      if (!event) return event;
      const p = event.properties || {};
      for (const k of ["$current_url", "$referrer", "$pathname"]) {
        if (typeof p[k] === "string") {
          try {
            const u = new URL(p[k], window.location.origin);
            p[k] = normalizePath(u.pathname);
          } catch {
            p[k] = normalizePath(p[k].split("?")[0]);
          }
        }
      }
      delete p.$raw_user_agent;
      event.properties = p;
      return event;
    },
  });
  enabled = true;
}

export const analytics = {
  capture(event, props) {
    if (enabled) posthog.capture(event, props);
  },
  // Called once per authenticated session with the stable app user id — never an
  // email or name (teen-safety: no directly-identifying data in analytics).
  identify(userId, props) {
    if (enabled && userId) posthog.identify(String(userId), props);
  },
  pageview(pathname) {
    if (enabled) posthog.capture("$pageview", { $current_url: normalizePath(pathname) });
  },
  reset() {
    if (enabled) posthog.reset();
  },
};
