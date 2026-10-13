// Victory AI theme: the one file for colour. Light and dark palettes live here and nowhere else.
//
// How it reaches the screen: at start-up `installTheme()` turns these palettes into CSS custom
// properties (`--victory-*` and the shadcn/ui tokens). Every `victory-*` Tailwind class and every
// UI component reads those variables, so when the phone switches between light and dark the
// whole app changes at once. No screen has its own light/dark code.
//
// JS consumers (canvas charts, share images, inline SVG) read the same values through
// `useTheme()` / `usePalette()` in src/hooks/useColorScheme.js.

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

// shadcn/ui component tokens, as HSL channels ("H S% L%").
const ui = {
  light: {
    background: "240 20% 97%", foreground: "240 10% 10%",
    card: "0 0% 100%", "card-foreground": "240 10% 10%",
    popover: "0 0% 100%", "popover-foreground": "240 10% 10%",
    primary: "70 100% 25%", "primary-foreground": "240 20% 97%",
    secondary: "240 15% 92%", "secondary-foreground": "240 10% 12%",
    muted: "240 15% 92%", "muted-foreground": "240 8% 42%",
    accent: "240 15% 92%", "accent-foreground": "240 10% 12%",
    destructive: "0 72% 48%", "destructive-foreground": "0 0% 100%",
    border: "240 15% 86%", input: "240 15% 86%", ring: "70 100% 30%",
    "chart-1": "70 100% 35%", "chart-2": "168 80% 38%", "chart-3": "20 90% 48%",
    "chart-4": "0 72% 48%", "chart-5": "240 8% 42%",
  },
  dark: {
    background: "240 20% 4%", foreground: "240 10% 96%",
    card: "240 20% 7%", "card-foreground": "240 10% 96%",
    popover: "240 20% 7%", "popover-foreground": "240 10% 96%",
    primary: "70 100% 63%", "primary-foreground": "240 20% 4%",
    secondary: "240 15% 13%", "secondary-foreground": "240 10% 96%",
    muted: "240 15% 13%", "muted-foreground": "240 10% 58%",
    accent: "240 15% 13%", "accent-foreground": "240 10% 96%",
    destructive: "0 84% 60%", "destructive-foreground": "240 10% 96%",
    border: "240 15% 20%", input: "240 15% 20%", ring: "70 100% 63%",
    "chart-1": "70 100% 63%", "chart-2": "168 80% 59%", "chart-3": "20 90% 60%",
    "chart-4": "0 84% 60%", "chart-5": "240 10% 58%",
  },
};

export const palettes = { light, dark };
export const SCHEMES = ["light", "dark"];

export function getPalette(scheme) {
  return scheme === "light" ? light : dark;
}

// "#E8FF47" -> "232 255 71": channels, so Tailwind's /opacity modifiers work (bg-victory-lime/20).
export function hexToChannels(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function themeVars(scheme) {
  const brand = Object.entries(getPalette(scheme)).map(([k, v]) => `--victory-${k}: ${hexToChannels(v)};`);
  const comp = Object.entries(ui[scheme === "light" ? "light" : "dark"]).map(([k, v]) => `--${k}: ${v};`);
  return [...brand, ...comp].join(" ");
}

// Light by default; dark when the phone asks for it, or when <html data-theme="dark"> is set.
// An explicit data-theme always wins, so a manual switch works both ways.
export function themeCss() {
  return [
    `:root { ${themeVars("light")} --radius: 0.5rem; color-scheme: light; }`,
    `:root[data-theme="dark"] { ${themeVars("dark")} color-scheme: dark; }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${themeVars("dark")} color-scheme: dark; } }`,
  ].join("\n");
}

// Runs once before the first render (src/index.js).
export function installTheme(doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return;
  let el = doc.getElementById("victory-theme");
  if (!el) {
    el = doc.createElement("style");
    el.id = "victory-theme";
    doc.head.prepend(el);
  }
  el.textContent = themeCss();
}
