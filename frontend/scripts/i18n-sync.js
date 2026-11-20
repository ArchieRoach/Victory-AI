// Keeps the language files in step with the code.
//   node scripts/i18n-sync.js            adds new English lines found in t("key", "English") calls,
//                                        then lists what each language is still missing
//   node scripts/i18n-sync.js --out DIR  also writes DIR/<lang>.json with the missing English lines
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const LOCALES = path.join(SRC, "i18n", "locales");
const CALL = /\b(?:t|tx)\(\s*(["'`])([\w.-]+)\1\s*(?:,\s*(["'`])((?:\\.|(?!\3).)*)\3)?/g;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === "node_modules" ? [] : walk(p);
  return /\.(jsx?|tsx?)$/.test(d.name) && !/\.test\./.test(d.name) ? [p] : [];
});

const flat = (obj, pre = "") => Object.entries(obj).reduce((acc, [k, v]) => (
  v && typeof v === "object" ? { ...acc, ...flat(v, `${pre}${k}.`) } : { ...acc, [`${pre}${k}`]: v }
), {});

const setDeep = (obj, key, value) => {
  const parts = key.split(".");
  let o = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof o[p] !== "object" || o[p] === null) o[p] = {};
    o = o[p];
  }
  o[parts.at(-1)] = value;
};

function usedKeys() {
  const found = {};
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(CALL)) {
      const def = m[4] === undefined ? undefined : m[3] === '"' ? JSON.parse(`"${m[4]}"`) : m[4].replace(/\\(["'`\\])/g, "$1");
      if (!(m[2] in found) || (found[m[2]] === undefined && def !== undefined)) found[m[2]] = def;
    }
  }
  return found;
}

function main() {
  const outIdx = process.argv.indexOf("--out");
  const outDir = outIdx > -1 ? process.argv[outIdx + 1] : null;
  const enPath = path.join(LOCALES, "en", "translation.json");
  const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
  const enFlat = flat(en);
  const used = usedKeys();
  const noEnglish = [];
  let added = 0;
  for (const [key, def] of Object.entries(used)) {
    if (key in enFlat || key.includes("..") || key.endsWith(".")) continue;
    if (def === undefined) { noEnglish.push(key); continue; }
    setDeep(en, key, def);
    enFlat[key] = def;
    added += 1;
  }
  if (added) fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);
  console.log(`en: added ${added}${noEnglish.length ? `, ${noEnglish.length} used with no English: ${noEnglish.join(", ")}` : ""}`);

  for (const lang of fs.readdirSync(LOCALES).filter((l) => l !== "en")) {
    const have = flat(JSON.parse(fs.readFileSync(path.join(LOCALES, lang, "translation.json"), "utf8")));
    const missing = Object.fromEntries(Object.entries(enFlat).filter(([k]) => !(k in have)));
    console.log(`${lang}: missing ${Object.keys(missing).length}`);
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${lang}.json`), `${JSON.stringify(missing, null, 1)}\n`);
    }
  }
}

if (require.main === module) main();
module.exports = { flat, setDeep, usedKeys };
