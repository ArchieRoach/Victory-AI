const fs = require("fs");
const path = require("path");

// CLAUDE.md "Words rule": friend groups are a squad on every screen, never a crew.
const VISIBLE_CREW = /\b(Crews?\b|your crew|crew (mission|combo|moments?)|crew-mates?)/;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(jsx?|json)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

test("no screen says crew", () => {
  const src = path.join(__dirname, "..");
  const hits = files(src).flatMap((f) => fs.readFileSync(f, "utf8").split("\n")
    .map((line, i) => ({ f, i, line }))
    .filter(({ line }) => !/^\s*(\/\/|\/?\*)/.test(line) && !/function |<\/?[A-Z]\w*Crew|Crew[A-Z]\w*/.test(line) && VISIBLE_CREW.test(line)));
  expect(hits.map(({ f, i, line }) => `${path.relative(src, f)}:${i + 1} ${line.trim()}`)).toEqual([]);
});
