# Lovable prompt: launch moved to January (paste as-is)

Our launch has moved. Please remove every hard-coded launch date from the site and use the dates the
backend already sends, so a future move never needs another site change.

1. `GET https://victory-ai-backend-production.up.railway.app/api/waitlist/stats` now returns, inside `launch`:
   `early_access_label` (e.g. "4 January"), `early_access_days_to_go`, `season_one_label` (e.g. "11 January"),
   `days_to_go`, and `founding_until_label` (e.g. "22 February").
2. Replace every "30 November" with `{early_access_label}`. For example:
   - "Get in a week early ({early_access_label})"
   - "Waitlist gets in on {early_access_label}, a week before everyone else."
   - After sign-up: "You're in! We'll email your early-access link on {early_access_label}."
3. Replace "7 December" with `{season_one_label}` (e.g. "Season 1 starts {season_one_label} · {days_to_go} days to go").
4. Replace "18 January 2027" with `{founding_until_label}` (Founding Fighter: "Join before Season 2 starts on {founding_until_label}").
5. While the stats are loading or if the request fails, show the line without a date (e.g. "Get in a week early"), never an old date.
6. Don't change anything else. List every place you changed.
