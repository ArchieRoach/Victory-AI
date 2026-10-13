import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import path from "path";
import { GlassView, GlassContainer, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from "expo-glass-effect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(el) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(el));
  return host;
}

test("GlassView takes Expo's props and renders web glass", () => {
  const ref = createRef();
  const host = render(<GlassView ref={ref} glassEffectStyle="clear" tintColor="#47E8C8" isInteractive className="p-4" data-testid="g">Hi</GlassView>);
  const el = host.querySelector('[data-testid="g"]');
  expect(el.className).toBe("glass glass-clear glass-interactive p-4");
  expect(el.style.getPropertyValue("--glass-tint")).toBe("#47E8C8");
  expect(ref.current).toBe(el);
  expect(render(<GlassView glassEffectStyle="none" className="x">a</GlassView>).firstChild.className).toBe("x");
  expect(render(<GlassView as="nav">a</GlassView>).firstChild.tagName).toBe("NAV");
  expect(render(<GlassContainer spacing={12}>a</GlassContainer>).firstChild.style.gap).toBe("12px");
});

test("availability helpers answer honestly without a blur-capable browser", () => {
  expect(typeof isGlassEffectAPIAvailable()).toBe("boolean");
  expect(isLiquidGlassAvailable()).toBe(false);
});

test("corners are concentric: inner radius = outer radius minus padding, never below the minimum", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "..", "index.css"), "utf8");
  expect(css).toMatch(/--cr1: max\(var\(--r-min\), calc\(var\(--r1\) - var\(--pad\)\)\)/);
  expect(css).toMatch(/--cr1: inherit;/);
  expect(css).toMatch(/--cr2: max\(var\(--r-min\), calc\(var\(--cr1\) - var\(--pad\)\)\)/);
  expect(css).toMatch(/:where\(\.glass\) \{ position: relative/);
});
