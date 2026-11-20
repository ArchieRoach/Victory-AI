// Guards the "every language, every screen" promise: a co-founder who picks Portuguese should never
// meet an English line. New screen words go through tx("key", "English"); run
// `node scripts/i18n-sync.js` to add them to en, then translate the lines it lists.
const fs = require("fs");
const path = require("path");
const { flat, usedKeys } = require("../../scripts/i18n-sync");

const LOCALES = path.join(__dirname, "locales");
const read = (lang) => flat(JSON.parse(fs.readFileSync(path.join(LOCALES, lang, "translation.json"), "utf8")));
const en = read("en");
const others = fs.readdirSync(LOCALES).filter((l) => l !== "en");
const vars = (s) => String(s).match(/\{\{\w+\}\}/g) || [];
// A translation may drop an English-only helper like {{plural}}, but never invent one.
const unknownVars = (english, translated) => vars(translated).filter((v) => !vars(english).includes(v));

test("every word the screens use has an English line", () => {
  const missing = Object.keys(usedKeys()).filter((k) => !(k in en) && !k.endsWith(".") && !k.includes(".."));
  expect(missing).toEqual([]);
});

test.each(others)("%s has every English line", (lang) => {
  const have = read(lang);
  expect(Object.keys(en).filter((k) => !(k in have))).toEqual([]);
});

test.each(others)("%s keeps the {{placeholders}} of each line", (lang) => {
  const have = read(lang);
  const broken = Object.keys(en).filter((k) => k in have && unknownVars(en[k], have[k]).length);
  expect(broken).toEqual([]);
});
