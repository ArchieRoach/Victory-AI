import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useColorScheme, useTheme, useApplyColorScheme } from "./useColorScheme";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function fakeMedia(dark) {
  const listeners = new Set();
  const mq = { matches: dark, addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f) };
  window.matchMedia = () => mq;
  return { set(v) { mq.matches = v; listeners.forEach((f) => f({ matches: v })); }, listeners };
}

test("follows the phone setting live, and every component updates together", () => {
  const phone = fakeMedia(false);
  const seen = {};
  function A() { seen.a = useColorScheme(); return null; }
  function B() { seen.b = useTheme().colors.bg; return null; }
  function Root() { useApplyColorScheme(); return <><A /><B /></>; }
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<Root />));
  expect(seen).toEqual({ a: "light", b: "#F6F6F9" });
  expect(document.documentElement.dataset.theme).toBe("light");

  act(() => phone.set(true));
  expect(seen).toEqual({ a: "dark", b: "#0A0A0F" });
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.querySelector('meta[name="theme-color"]').content).toBe("#0A0A0F");

  act(() => root.unmount());
  expect(phone.listeners.size).toBe(0);
});
