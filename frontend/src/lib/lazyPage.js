import { lazy } from "react";

// Pages load on demand so the first visit downloads only the app shell and the page
// being opened. Two safeguards:
//  • After a deploy, an open tab can ask for a chunk file that no longer exists. Reload
//    once to pick up the new build instead of showing a blank screen (a session flag stops
//    reload loops if the failure is real, e.g. offline).
//  • `preload()` fetches a page early (on idle) so likely next taps stay instant.
const RELOAD_FLAG = "victory_chunk_reload";

export const isChunkLoadError = (err) =>
  /Loading chunk [\w-]+ failed|ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(
    `${err?.name || ""} ${err?.message || ""}`,
  );

export function loadWithReload(loader, { storage = window.sessionStorage, reload = () => window.location.reload() } = {}) {
  return loader().then(
    (mod) => {
      try { storage.removeItem(RELOAD_FLAG); } catch {}
      return mod;
    },
    (err) => {
      let reloaded = false;
      try { reloaded = storage.getItem(RELOAD_FLAG) === "1"; } catch {}
      if (isChunkLoadError(err) && !reloaded) {
        try { storage.setItem(RELOAD_FLAG, "1"); } catch {}
        reload();
        return new Promise(() => {}); // the page is reloading; never render the error
      }
      throw err;
    },
  );
}

export function lazyPage(loader) {
  const Page = lazy(() => loadWithReload(loader));
  Page.preload = () => loader().catch(() => {});
  return Page;
}
