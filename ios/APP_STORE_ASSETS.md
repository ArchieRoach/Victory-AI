# App Store pictures and video

What works best on the App Store, and what's ready in `ios/store-screenshots/`.

**Goal:** more people who see Victory AI in search tap "Get" (product-page conversion).
**Psychology:** people decide in about 3 seconds from the first three pictures, which show in search
results before anyone opens the page. A benefit beats a feature list (people buy the result, not the
tool), and showing proof builds trust faster than saying "trust us".
**Design:** picture 1 leads with the benefit, picture 2 shows how it works in three steps, picture 3
shows the proof (every score has a timestamp). Real app screens only. Short headlines readable at
thumbnail size.

## What the research says
- **The first three pictures do most of the work.** They show in search results without opening the
  page, and most people never scroll further. ([Appsprint](https://appsprint.app/aso/blog/app-store-screenshot-optimization),
  [Sonar](https://trysonar.app/blog/app-store-screenshot-captions))
- **Lead with a benefit, in 4 to 8 words.** Not a login screen and not a menu. ([AppTweak](https://www.apptweak.com/en/aso-blog/how-to-optimize-your-app-screenshots),
  [App Screenshot Studio](https://dev.to/appscreenshotstudio/app-store-screenshots-that-convert-the-2026-design-guide-1d94))
- **Tell a story across the first three, not a tour of screens.** Order: benefit, how it works, why
  to trust it.
- **Test them:** show 5 people the first three for 3 seconds and ask "what does this app do?". If
  they can't say "it coaches my boxing", change picture 1.
- Treat the "70% of conversions" style numbers from blogs with care: they come from vendors without
  public methods.

## Apple's rules (checked Nov 2026)
- **Screenshots:** 1 to 10 per device size, PNG or JPEG. Only the **6.9-inch iPhone** set
  (**1320 × 2868** portrait) is required; Apple scales it down for smaller phones. An iPad set
  (13-inch) is needed only if the app runs on iPad. ([Apple: screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications))
- **App preview video:** optional, **15 to 30 seconds**, up to 3 per device size, H.264 or ProRes
  422 HQ, max 500 MB. For the 6.9-inch size upload **886 × 1920** portrait (not the screen's own
  resolution). It plays muted on autoplay, so it must make sense without sound. ([Apple: app preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications))
- Screenshots must show the real app. Example data is fine; invented features are not.

## Ready to upload (`ios/store-screenshots/`, 1320 × 2868)
| # | File | Job | Headline |
|---|---|---|---|
| 1 | `01-benefit.png` | Benefit | **Get better at boxing, every round.** Results screen: 7.4/10, +0.8 since last session, Gold rank. |
| 2 | `02-how-it-works.png` | How it works | **Prop up your phone. Your coach does the rest.** 1 Film a round, 2 Hear your combos ("Jab · Cross · Hook"), 3 See your score. |
| 3 | `03-trust.png` | Trust | **Every score shows what the AI saw.** Round replay with timestamps ("0:12 jab snaps straight back to guard"). |

They're built from real app screens (`r1.png`, `t1.png`, `d1.png`) with example scores, framed by
`compose.html`. To change a headline: edit `compose.html`, open it in Chrome at 440 × 956 with 3×
scaling (or ask Claude to re-render).

## Next pictures (4 to 6), in this order
4. **Your squad and weekly streak** (home screen with the streak row): "Train with your squad. Keep the streak."
5. **Workout timer with the camera on**, filmed for real: "Bag, pads, circuits, HIIT."
6. **Seasons and the Golden Gloves:** "Six-week seasons. One prize you earn."

## App preview video (worth doing before launch)
15 to 25 seconds, filmed on a real phone in a real gym, no voice-over needed:
1. 0–3s: phone propped against the bag, round starts (the timer and "REC" visible).
2. 3–12s: boxer working; on-screen the coach's combo call appears ("Jab, cross, hook").
3. 12–20s: the results screen: score ring fills, "+0.8 since last session".
4. 20–25s: the replay with a timestamp, then the app name.
Export at 886 × 1920, H.264.

## Ratings (stars show in search, next to the first picture)
- Ratings move downloads: one study of 49 companies found 4.5-star apps convert at 96% of 5-star
  apps, 4-star at 83% and 3-star at 57%. Below 4 stars is where it really hurts. ([NP Digital](https://neilpatel.com/marketing-stats/app-downloads-vs-ratings/),
  [Alchemer](https://www.alchemer.com/resources/blog/mobile-ratings-good-bad-ugly/))
- The app now asks for a rating with Apple's own sheet straight after a real win (PB, boss beaten,
  level-up), never in someone's first sessions, never from a button, at most every 120 days
  (`frontend/src/lib/ratingPrompt.js`). Apple shows it 3 times a year at most.
- Launch week: ask the waitlist's first users (by email, not in the app) to leave an honest rating
  once they've trained twice. Never offer anything in return; Apple forbids paid or swapped reviews.

## Launch tools in App Store Connect
- **In-app event "Season 1: The Golden Gloves"**: text ready in `ios/APP_STORE_LISTING.md`. Shows as a
  card in search before launch day. ([Apple](https://developer.apple.com/app-store/in-app-events/))
- **Product page optimisation**: once live with ~1,000 page views a week, A/B test picture 1 (benefit
  headline vs. a real gym photo) in App Store Connect.
- **Promotional text** can change any time without review: use it for "Season 1 starts 7 December", then
  "Season 1 is live".
