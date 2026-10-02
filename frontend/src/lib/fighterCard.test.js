import { fighterCardContent } from "./fighterCard";

const user = { display_name: "Archie Roach", weight_class: "Welterweight", stance: "Orthodox" };

test("a PB card shows the PB, overall and rank", () => {
  const c = fighterCardContent({
    user,
    overall: 7.25,
    rewards: {
      personal_bests: { new: [{ name: "Overall", score: 7.3 }, { name: "Jab", score: 8 }] },
      season: { rank: "Contender", number: 3 },
    },
  });
  expect(c.headline).toBe("NEW PERSONAL BEST");
  expect(c.stats).toEqual([{ label: "OVERALL", value: "7.3" }, { label: "JAB", value: "8" }]);
  expect(c.rank).toBe("CONTENDER · SEASON 3");
  expect(c.tags).toEqual(["WELTERWEIGHT", "ORTHODOX"]);
  expect(c.footnote).toBeNull();
});

test("a beaten callout leads, and live punches are marked as phone-counted", () => {
  const c = fighterCardContent({
    user,
    rewards: { callouts_beaten: [{ challenger_name: "Sam" }] },
    liveStats: { punches: 212 },
  });
  expect(c.headline).toBe("TOOK SAM'S TITLE");
  expect(c.stats).toEqual([{ label: "PUNCHES*", value: "212" }]);
  expect(c.footnote).toMatch(/phone/);
});

test("long names are trimmed and missing data doesn't crash", () => {
  const c = fighterCardContent({ user: { name: "A".repeat(40) } });
  expect(c.name).toHaveLength(24);
  expect(c.stats).toEqual([]);
  expect(c.rank).toBeNull();
});
