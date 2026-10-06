import { scoreFighter, checkStable, scoreStable, rankLeague, isCardLocked, SALARY_CAP } from "./fantasyScoring";

const bout = (result, status = "complete") => ({
  bout_id: "b1",
  status,
  scheduled_rounds: 12,
  fighters: [{ fighter_id: "a", salary: 40 }, { fighter_id: "b", salary: 30 }],
  result,
});

test("nothing is scored until the bout is complete", () => {
  expect(scoreFighter("a", bout(null, "live"))).toBeNull();
  expect(scoreFighter("a", bout(null, "upcoming"))).toBeNull();
});

test("stoppage wins: base 20 plus a finish bonus by round band", () => {
  expect(scoreFighter("a", bout({ winner_id: "a", method: "KO", round: 3 })).total).toBe(30);
  expect(scoreFighter("a", bout({ winner_id: "a", method: "TKO", round: 4 })).total).toBe(30);
  expect(scoreFighter("a", bout({ winner_id: "a", method: "KO", round: 5 })).total).toBe(25);
  expect(scoreFighter("a", bout({ winner_id: "a", method: "TKO", round: 8 })).total).toBe(25);
  expect(scoreFighter("a", bout({ winner_id: "a", method: "KO", round: 9 })).total).toBe(22);
  expect(scoreFighter("a", bout({ winner_id: "a", method: "KO", round: 12 })).total).toBe(22);
});

test("a DQ win is +20 but earns no knockout bonus", () => {
  const s = scoreFighter("a", bout({ winner_id: "a", method: "DQ", round: 2 }));
  expect(s.total).toBe(20);
  expect(s.lines.filter((l) => l.kind === "bonus")).toHaveLength(0);
});

test("decisions: UD 15, SD/MD 10, plus clean sweep", () => {
  expect(scoreFighter("a", bout({ winner_id: "a", method: "UD", round: 12 })).total).toBe(15);
  expect(scoreFighter("a", bout({ winner_id: "a", method: "SD", round: 12 })).total).toBe(10);
  expect(scoreFighter("a", bout({ winner_id: "a", method: "MD", round: 12 })).total).toBe(10);
  expect(scoreFighter("a", bout({ winner_id: "a", method: "UD", round: 12, clean_sweep: true })).total).toBe(25);
});

test("decision wins never get a finish bonus even though they end in a late round", () => {
  const s = scoreFighter("a", bout({ winner_id: "a", method: "UD", round: 12 }));
  expect(s.lines.map((l) => l.label)).toEqual(["Win · Unanimous decision"]);
});

test("losses score 0 whatever the method; draws and no contests score 5 for both", () => {
  expect(scoreFighter("b", bout({ winner_id: "a", method: "KO", round: 1, clean_sweep: true })).total).toBe(0);
  expect(scoreFighter("b", bout({ winner_id: "a", method: "KO", round: 1 })).outcome).toBe("loss");
  for (const method of ["TD", "NC", "D"]) {
    expect(scoreFighter("a", bout({ winner_id: null, method, round: 3 })).total).toBe(5);
    expect(scoreFighter("b", bout({ winner_id: null, method, round: 3 })).total).toBe(5);
  }
});

test("the best possible night: early KO with a clean sweep = 40", () => {
  expect(scoreFighter("a", bout({ winner_id: "a", method: "KO", round: 2, clean_sweep: true })).total).toBe(40);
});

const card = {
  status: "upcoming",
  bouts: [
    { bout_id: "b1", status: "upcoming", fighters: [{ fighter_id: "a", salary: 45 }, { fighter_id: "b", salary: 30 }] },
    { bout_id: "b2", status: "upcoming", fighters: [{ fighter_id: "c", salary: 35 }, { fighter_id: "d", salary: 20 }] },
  ],
};

test("salary cap: spent, remaining and over-cap warnings", () => {
  expect(SALARY_CAP).toBe(100);
  const ok = checkStable(["a", "b", "d"], card);
  expect(ok).toMatchObject({ spent: 95, remaining: 5, overCap: false, full: true, valid: true });
  const over = checkStable(["a", "b", "c"], card);
  expect(over).toMatchObject({ spent: 110, remaining: -10, overCap: true, valid: false });
  expect(over.errors[0]).toBe("Over the cap by 10M.");
  const short = checkStable(["d"], card);
  expect(short.valid).toBe(false);
  expect(short.errors).toContain("Pick 2 more fighters.");
});

test("stable and league scoring with shared ranks on ties", () => {
  const done = {
    status: "complete",
    bouts: [
      { ...card.bouts[0], status: "complete", result: { winner_id: "a", method: "KO", round: 2 } },
      { ...card.bouts[1], status: "complete", result: { winner_id: "d", method: "UD", round: 12 } },
    ],
  };
  expect(scoreStable(["a", "b", "d"], done).total).toBe(30 + 0 + 15);
  const league = rankLeague([
    { user_id: "1", name: "Zed", picks: ["a", "b", "d"] },
    { user_id: "2", name: "Amy", picks: ["a", "c", "d"] },
    { user_id: "3", name: "Bo", picks: ["b", "c"] },
  ], done);
  expect(league.map((m) => [m.name, m.total, m.rank])).toEqual([["Amy", 45, 1], ["Zed", 45, 1], ["Bo", 0, 3]]);
});

test("picks lock once the card is under way", () => {
  expect(isCardLocked(card)).toBe(false);
  expect(isCardLocked({ ...card, status: "live" })).toBe(true);
});
