import { renderToStaticMarkup } from "react-dom/server";
import { ComboDisplay, currentIndex } from "./ComboDisplay";
import { comboTokens } from "@/lib/comboCaller";

test("with the camera, the highlight sits right after the last punch counted", () => {
  const t = comboTokens("1-2-slip-3", "orthodox");
  expect(currentIndex(t, 0, 0)).toBe(0);
  expect(currentIndex(t, 0, 2)).toBe(2);
  expect(currentIndex(t, 0, 3)).toBe(3);
});

test("without the camera, it moves on a steady beat after the call", () => {
  const t = comboTokens("1-2-3", "orthodox");
  expect(currentIndex(t, 300)).toBe(0);
  expect(currentIndex(t, 1300)).toBe(1);
  expect(currentIndex(t, 9000)).toBe(2);
});

test("shows the numbers, the punch you're on and the next one", () => {
  const html = renderToStaticMarkup(<ComboDisplay combo="1-2-3b" stance="orthodox" startedAt={performance.now()} getPunches={() => 1} />);
  expect(html).toMatch(/data-testid="combo-now"[^>]*>Cross</);
  expect(html).toMatch(/data-testid="combo-next"[^>]*>Next: 3b/);
});
