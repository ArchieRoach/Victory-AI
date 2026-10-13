import { useEffect, useSyncExternalStore } from "react";
import { getPalette } from "@/theme/theme";

// Reads the phone's light/dark setting and follows it live: flip the setting (or let it switch
// at sunset) and every subscriber re-renders on the same frame. One shared listener for the
// whole app, however many components ask.
const QUERY = "(prefers-color-scheme: dark)";

const media = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY) : null);

function subscribe(onChange) {
  const mq = media();
  if (!mq) return () => {};
  // Safari < 14 only supports the deprecated addListener signature.
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else mq.addListener(onChange);
  return () => (mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange));
}

const snapshot = () => (media()?.matches === false ? "light" : "dark");
const serverSnapshot = () => "dark";

export function useColorScheme() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

// The current scheme and its colours, for anything that can't use a CSS class.
export function useTheme() {
  const scheme = useColorScheme();
  return { scheme, colors: getPalette(scheme) };
}

export function usePalette() {
  return useTheme().colors;
}

// Call once, high in the tree. Marks <html> with the scheme (so the CSS variables flip) and keeps
// the browser chrome (status bar, address bar) the same colour as the app.
export function useApplyColorScheme() {
  const scheme = useColorScheme();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = scheme;
    root.style.colorScheme = scheme;
    let meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = getPalette(scheme).bg;
  }, [scheme]);
  return scheme;
}
