const { widgetPayload } = require("./widgetSync");

test("the widget gets this week's real numbers and the season rank", () => {
  const stats = { weekly_streak: { current: 3, this_week_days: 2, per_week: 3 }, week_activity: [{ active: false }, { active: true }] };
  const season = { rank: "Gold", points: 340, next_rank: "Platinum", next_at: 450 };
  expect(widgetPayload(stats, season)).toEqual({
    action: "update", week_days: 2, week_goal: 3, streak_weeks: 3, trained_today: true,
    rank: "Gold", points: 340, next_rank: "Platinum", next_at: 450,
  });
});

test("missing numbers become zero or nothing, never made up", () => {
  expect(widgetPayload({}, null)).toEqual({
    action: "update", week_days: 0, week_goal: 3, streak_weeks: 0, trained_today: false,
    rank: null, points: null, next_rank: null, next_at: null,
  });
});
