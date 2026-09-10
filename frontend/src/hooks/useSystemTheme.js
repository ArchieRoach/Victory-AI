import { useEffect, useState } from "react";
import { getPalette } from "@/theme/palette";

const QUERY = "(prefers-color-scheme: dark)";

function currentSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia(QUERY).matches ? "dark" : "light";
}

// Tracks the OS/phone light-dark setting in real time and reflects it onto
// <html data-theme="…">, which flips every `--victory-*` CSS variable (and thus
// every `victory-*` Tailwind class) instantly. Call once, high in the tree.
export function useSystemTheme() {
  const [theme, setTheme] = useState(currentSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e) => setTheme(e.matches ? "dark" : "light");
    // Safari <14 only supports the deprecated addListener signature.
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    setTheme(mq.matches ? "dark" : "light");
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return theme;
}

// Convenience for JS consumers that need the actual hex values (canvas, inline
// styles) rather than a CSS class.
export function usePalette() {
  return getPalette(useSystemTheme());
}
