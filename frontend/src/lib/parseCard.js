// Turns a fight card pasted as text into bouts, so a promoter or admin can paste the line-up
// they already have (from a poster, a message or a spreadsheet) instead of typing every box.
// One bout per line. Each line has two names, each with an optional record, separated by
// "vs" or "v". An optional division and an optional round count are also allowed:
//   Welterweight: Lee Smith (8-0) vs Kay Jones 3-5-1, 6 rounds
//   Max Hill 1-0 v Rob Day  4rds
//   Amy Ross vs Jo Bell (3)
const ROUNDS = /[,\s]*(?:\((\d{1,2})\)|\(?(\d{1,2})\s*(?:x\s*\d+(?:\s*min)?|rounds?|rds?|r)\)?)\s*$/i;
const DIVISION = /^\s*([A-Za-z -]*weight)\s*[:\-–]\s*/i;
const SIDE = /^(.*?)[\s,(]*(\d{1,3})\s*-\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?\s*\)?\s*$/;

function side(text) {
  const m = text.trim().match(SIDE);
  if (!m) return { name: text.replace(/[(),]/g, "").trim(), wins: 0, losses: 0, draws: 0, ko_wins: 0 };
  return { name: m[1].replace(/[(),]/g, "").trim(), wins: +m[2], losses: +m[3], draws: +(m[4] || 0), ko_wins: 0 };
}

export function parseCard(text, defaultRounds = 4) {
  const bouts = [];
  const skipped = [];
  for (const raw of (text || "").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    let division = "";
    const d = line.match(DIVISION);
    if (d) { division = d[1].trim(); line = line.slice(d[0].length); }
    let rounds = defaultRounds;
    const r = line.match(ROUNDS);
    const n = r ? +(r[1] || r[2]) : 0;
    if (n >= 1 && n <= 12) { rounds = n; line = line.slice(0, r.index); }
    const parts = line.split(/\s+(?:vs?\.?|versus)\s+/i);
    if (parts.length !== 2) { skipped.push(raw.trim()); continue; }
    const fighters = parts.map(side);
    if (fighters.some((f) => f.name.length < 2)) { skipped.push(raw.trim()); continue; }
    bouts.push({ division, scheduled_rounds: rounds, fighters });
  }
  return { bouts, skipped };
}
