import { normalizePath } from "./analytics";

test("normalizePath scrubs id-ish path segments", () => {
  expect(normalizePath("/profile/user_2abcDEF123")).toBe("/profile/:id");
  expect(normalizePath("/sessions/650f1c2e9a1b4c8d7e6f0a11")).toBe("/sessions/:id");
  expect(normalizePath("/stream/a1b2c3d4-e5f6-7788-99aa-bbccddeeff00")).toBe("/stream/:id");
  expect(normalizePath("/compete/42")).toBe("/compete/:id");
});

test("normalizePath leaves real routes alone", () => {
  expect(normalizePath("/home")).toBe("/home");
  expect(normalizePath("/paywall")).toBe("/paywall");
  expect(normalizePath("/gyms")).toBe("/gyms");
  expect(normalizePath("/")).toBe("/");
  expect(normalizePath("")).toBe("/");
  // short hex-ish words that are actually route names must survive
  expect(normalizePath("/feed")).toBe("/feed");
});
