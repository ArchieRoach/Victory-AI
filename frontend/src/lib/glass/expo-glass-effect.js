import { createElement, forwardRef, useCallback } from "react";

// GlassView with the same API as Expo's `expo-glass-effect`, built for this web app.
//
// Why not the real package: `expo-glass-effect` is a native module for Expo / React Native apps
// (it draws iOS 26 "Liquid Glass" with UIKit). Victory AI is a React web app, and the App Store
// app shows that web app inside a native shell, so the Expo module can't run here and would pull
// React Native into the web build. `import { GlassView } from "expo-glass-effect"` resolves to
// this file (craco.config.js alias), so screens are written exactly as they would be in Expo. If
// the app ever moves to Expo, removing the alias swaps in the real native glass with no screen edits.
// The native SwiftUI screens use Apple's real Liquid Glass (ios/VictoryAI/Shared/GlassView.swift).
//
// Props (as in Expo): glassEffectStyle "regular" | "clear" | "none", tintColor, isInteractive.
export const GlassView = forwardRef(function GlassView(
  { glassEffectStyle = "regular", tintColor, isInteractive = false, as = "div", className = "", style, children,
    onPointerMove, ...rest },
  ref,
) {
  // Interactive glass catches the light where your finger is, like Liquid Glass.
  const track = useCallback((e) => {
    if (isInteractive) {
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty("--glass-x", `${e.clientX - r.left}px`);
      e.currentTarget.style.setProperty("--glass-y", `${e.clientY - r.top}px`);
    }
    onPointerMove?.(e);
  }, [isInteractive, onPointerMove]);

  const cls = glassEffectStyle === "none"
    ? className
    : `glass glass-${glassEffectStyle === "clear" ? "clear" : "regular"}${isInteractive ? " glass-interactive" : ""} ${className}`;
  return createElement(as, {
    ref, className: cls.trim(), onPointerMove: track,
    style: tintColor ? { "--glass-tint": tintColor, ...style } : style,
    ...rest,
  }, children);
});

// Groups glass shapes so they sit together like one sheet of glass (Expo's GlassContainer).
export function GlassContainer({ spacing = 8, className = "", style, children, ...rest }) {
  return createElement("div", { className: `glass-container ${className}`.trim(), style: { gap: spacing, ...style }, ...rest }, children);
}

const supportsBlur = () => {
  try {
    return typeof CSS !== "undefined" && (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)"));
  } catch { return false; }
};
const wantsSolid = () => {
  try { return window.matchMedia("(prefers-reduced-transparency: reduce)").matches; } catch { return false; }
};

// Same helpers as Expo. On the web, "available" means the browser can blur what's behind.
export const isGlassEffectAPIAvailable = () => supportsBlur();
export const isLiquidGlassAvailable = () => supportsBlur() && !wantsSolid();
