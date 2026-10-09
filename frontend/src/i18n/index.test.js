import i18n, { ensureLanguage } from "./index";

test("English is bundled and other languages load on demand", async () => {
  expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
  expect(i18n.hasResourceBundle("fr", "translation")).toBe(false);
  await ensureLanguage("fr");
  expect(i18n.hasResourceBundle("fr", "translation")).toBe(true);
  await i18n.changeLanguage("fr");
  const key = Object.keys(i18n.getResourceBundle("en", "translation"))[0];
  expect(i18n.t(key)).toEqual(expect.anything());
});

test("regional codes map to their base language and unknown codes are ignored", async () => {
  await ensureLanguage("de-AT");
  expect(i18n.hasResourceBundle("de", "translation")).toBe(true);
  await expect(ensureLanguage("xx")).resolves.toBeUndefined();
});
