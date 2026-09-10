// Victory AI theme palettes — single source of truth for the brand colour tokens.
//
// These same values are mirrored as CSS custom properties in src/index.css
// (`--victory-*`), which is what actually drives styling (every `victory-*`
// Tailwind class resolves to `var(--victory-*)`). Keep the two in sync — the
// self-check in src/theme/palette.test.js fails if they drift.
//
// JS consumers (canvas charts, the mascot render, anything that can't use a CSS
// class) should read from here via `usePalette()` / `useSystemTheme()` so they
// track the active theme too.

export const dark = {
  bg: "#0A0A0F",
  card: "#12121A",
  "card-highlight": "#1A1A26",
  border: "#2A2A3A",
  lime: "#E8FF47",
  orange: "#FF6B35",
  teal: "#47E8C8",
  danger: "#FF4757",
  text: "#F0F0F5",
  muted: "#8888A0",
};

export const light = {
  bg: "#F6F6F9",
  card: "#FFFFFF",
  "card-highlight": "#EEEEF3",
  border: "#DEDEE7",
  lime: "#5B7000",
  orange: "#C4530F",
  teal: "#0B8C77",
  danger: "#D92D20",
  text: "#16161C",
  muted: "#61617A",
};

export const palettes = { light, dark };

export function getPalette(theme) {
  return theme === "light" ? light : dark;
}
