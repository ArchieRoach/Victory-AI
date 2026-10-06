import { parseCard } from "./parseCard";

test("reads names, records, divisions and rounds from pasted lines", () => {
  const { bouts, skipped } = parseCard(
    "Welterweight: Lee Smith (8-0) vs Kay Jones 3-5-1, 6 rounds\nMax Hill 1-0 v Rob Day  4rds\n\nTitle fight tbc\nAmy Ross vs Jo Bell (3)",
  );
  expect(skipped).toEqual(["Title fight tbc"]);
  expect(bouts).toHaveLength(3);
  expect(bouts[0]).toEqual({
    division: "Welterweight", scheduled_rounds: 6,
    fighters: [
      { name: "Lee Smith", wins: 8, losses: 0, draws: 0, ko_wins: 0 },
      { name: "Kay Jones", wins: 3, losses: 5, draws: 1, ko_wins: 0 },
    ],
  });
  expect(bouts[1].scheduled_rounds).toBe(4);
  expect(bouts[1].fighters.map((f) => f.name)).toEqual(["Max Hill", "Rob Day"]);
  expect(bouts[2]).toMatchObject({ scheduled_rounds: 3, fighters: [{ name: "Amy Ross", wins: 0 }, { name: "Jo Bell" }] });
});

test("debutants with no record default to 0-0", () => {
  const { bouts } = parseCard("Sam Cole vs Ali Khan", 3);
  expect(bouts[0].scheduled_rounds).toBe(3);
  expect(bouts[0].fighters[1]).toEqual({ name: "Ali Khan", wins: 0, losses: 0, draws: 0, ko_wins: 0 });
});
