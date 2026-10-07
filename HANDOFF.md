# Session Handoff — Victory AI

> For the next Claude session. Read this first, then `git log`.

# Latest: Auto Highlights (merged to `main`, PR #1, `6ebdeb0`)

Product context: the audience is teens and 18–24s. Features should serve three drives:
**permission to show off, visible progress, identity expression.**

## What it does
- Viewers tap a flame **hype button** over the live video. When reactions spike, the server
  **auto-clips** the moment. The clip is watermarked (vertical 1080×1920, "VICTORY AI",
  @handle, "N REACTIONS AT ONCE") and shared as a real MP4 via the OS share sheet
  (TikTok / Reels / Snap / Shorts), with a download fallback.
- Streamers get a `/highlights` page (stats, best clip, share/post/delete). Go Live shows a live
  highlight counter, and ending a stream that produced highlights routes to them.
- Manual "Clip 30s" clips go through the same watermarking. **Viewers can now clip** live
  public streams (previously every non-owner got a 403).

## Where it lives
- **Backend (`server.py`, "Auto highlights" section after `ws_manager`):**
  - `HypeTracker` scores hype taps, chat, tips and gift subs per stream over a 10s window. It fires
    when the score is ≥12, ≥3× the 2-min baseline and ≥3 distinct reactors. Free signals are
    capped per user per window, the streamer's own reactions are excluded, and there's a 45s
    cooldown with a max of 15 per stream. It's **in memory**, so it assumes one Railway instance.
  - Pipeline `_run_highlight`: Livepeer `/clip` → poll asset → Cloudinary upload
    (`victory_highlights/{id}`) with an eager watermark transform → HEAD-poll until servable →
    `ready` + WS `highlight_ready` + push. Stale jobs resume lazily when the highlight is read.
  - Collection `highlights`, statuses `clipping|processing|ready|failed`. There are no indexes;
    the repo creates none anywhere.
  - Endpoints: `GET /highlights/mine`, `GET /streams/{id}/highlights`, `GET /highlights/{id}`,
    `POST /highlights/{id}/retry|publish|share`, `DELETE /highlights/{id}`.
  - WebSocket: client sends `{"type":"hype"}`. Server sends `hype_burst` (batched every 0.6s),
    `highlight` and `highlight_ready`.
- **Frontend:** `components/streaming/HypeOverlay.jsx`, `components/HighlightShareSheet.jsx`,
  `pages/HighlightsPage.jsx`, `lib/shareVideo.js`. Also touched `LiveChat`, `StreamViewPage`,
  `GoLivePage`, `ShareSheet`, `TrendingClipsPage`, the dashboard link, and the `float-up`
  keyframe in `tailwind.config.js`.
- **Tests:** `python3 backend/test_highlights.py` (14 checks, all services faked) and
  `frontend/src/lib/shareVideo.test.js`.

## Status / open items
- Cloudinary env vars are confirmed set on Railway.
- **Not yet verified on a real stream.** The main risk is clip timing: auto clips use server
  wall-clock time, while Livepeer times clips against the playhead. A 25s lead absorbs latency;
  confirm the clip lands on the moment. Failures log as `Highlight <id> failed: …` on Railway.
- Each highlight is a Cloudinary video render, which costs transformation credits.

## Habit-loop follow-up (branch `feature/habit-loop`)
Goal: cut the steps between "I want to show off" and the reward, and remove the need for an audience.
- **Training clips:** `POST /sessions/{id}/highlight` picks the best-scoring round, trims 30s from the
  middle, and uploads a *copy* to `victory_highlights/{id}` with an "AI SCORE 8.4 (+0.6) · JAB 9" badge.
  It never watermarks the original, so the share URL can't expose the full round. Only videos under
  `victory_rounds/{user_id}/` are accepted. Entry point: "Post your best round" on the session results screen.
- **One-tap share:** the push notification and the end-of-stream redirect use `/highlights?open=<id|best>`,
  which lands in the share sheet with the file already pre-fetched.
- **Easier first spike:** streams with fewer than 5 viewers need 2 reactors and a score of 8. A live
  hype meter (in `hype_burst.meter`) shows viewers "N more people to clip it!".
- **Squad go-live:** `POST /streams/go-live {audience: "public"|"squad", notify_squad}`. Squad-only
  streams are private with `allowed_viewer_ids`, enforced by `can_view_stream()` on the stream page,
  websocket, clip, highlights and feed. Pinging the squad is rate-limited to once per 30 min.
  Squad members who join after the stream starts can't see it until the next stream.

## Variable rewards (branch `feature/variable-rewards`)
- **Honest scoring:** failed or absent video analysis no longer invents scores. Previously
  `random.randint` filled every unwatched dimension, and camera recording is off by default, so
  that was most sessions. Unscored sessions now have `overall_score: None` and `scored: False`.
  `_avg_score` and `_best_score` skip them everywhere, and the UI shows "—" / "logged". Sessions
  saved before this change still contain the old random scores.
- **Self:** per-dimension personal bests (`users.personal_bests`, updated atomically with `$max`)
  plus near misses. 6-week seasons (`season_stats`, epoch 2026-01-05) with a Bronze→Champion
  ladder: 10 points per session, plus score and PB points for analysed sessions only (self-rated
  scorecards can't farm points).
- **Hunt:** each analysed session gets one scouting report of variable type and rarity: weakness,
  strength, rare weekly percentile (needs ≥20 samples), or epic elite. It's seeded by session_id,
  so it's stable. The number of report types found is tracked. Unscored sessions get a locked teaser.
- **Tribe:** `POST /highlights/{id}/send-to-squad` → squad mates stamp the round (`/rate/:id`,
  encouraging stamps only) → the owner gets a collapsing teaser push. The verdict unlocks at 5 stamps.
- **Safeguards:** no paid randomness anywhere. Teasers can be switched off (Profile →
  "Squad reactions"). Rewards run through `safe_session_rewards`, so they can never fail a session
  save. Account deletion and export now cover highlights, stamps and season stats.

## Investment loops (branch `feature/investment-loops`)
All background work runs in `_investment_loop`: it checks every 60s for due bookings and expired
callouts, and hourly for weekly reminders and film digests. Local times use the client's
`getTimezoneOffset()`, stored as `users.tz_offset_minutes`. Bookings are refused between 10pm and 5am local.
- **Book your next round:** a card on the results screen. The chips are Tomorrow 7am, Tomorrow 6pm,
  In 2 days 6pm, Saturday 10am and "Pick a time"; there is deliberately no "after school" chip. It
  creates `bookings`. At the booked time a push is sent ("Your footwork round is booked · PB to
  beat: 6") that opens `/train?focus=…`, where Train shows the focus and the PB. Training within 6h
  of the booking marks it kept.
- **Weekly reminder:** the Profile switch now works (it previously did nothing). It's stored in
  `notification_prefs.weekly_reminder`, defaults to on, and sends at most once a week at 5pm local.
  It's skipped if the user has a pending booking, trained in the last 24h, or joined in the last 7 days.
- **Squad callouts:** a new PB can be called out (`POST /callouts`). Squad mates get 7 days to beat
  it with a real analysed score. Beating it moves the "{Skill} King" title to the winner; an expired
  callout counts as defended and gives the challenger the title. The record and titles appear on
  profiles. `/callouts` page.
- **Fight Film:** up to 6 pinned ready highlights (`users.fight_film`) shown on the profile.
  Views are counted once per viewer per day (`film_views`). A weekly digest ("N views and M new
  followers") goes out at noon local. When a new training round beats the weakest round on a full
  reel, a "swap it in?" push is sent.

## Habit measurement (branch `feature/habit-measurement`)
- **Push links:** `_send_push` appends `?src=<kind>` to every push link, where the kind comes from
  the tag prefix (`booking`, `callout`, `stamps`, `weekly`, …). The app records what opened it
  (`lib/entrySource.js`, per tab) and strips `src` from the URL.
- **Session trigger:** training starts and manual scorecards send `entry_source` and
  `entry_age_minutes`. The server stores `trigger` on the session: the push kind if the session
  started within 60 minutes of tapping it, otherwise `direct`.
- **Metrics:** `GET /admin/habit-metrics?weeks=8` (ADMIN_EMAIL only) shows, per week, sessions,
  active users, sessions by trigger, % direct, median sessions per user, users in the 2–4/week
  habit zone and over it, % recorded, and booking kept-rate. **Success looks like % direct rising
  week on week.** Sessions saved before this change show as `untagged`.
- **Push deep-link fix:** `sw.js` used to only focus an already-open app, ignoring the link. It now
  navigates, or falls back to messaging the app, which routes itself.
- **Video choice:** still opt-in (high-privacy default for teens, per the UK Children's Code).
  Train now asks once ("Get scored by AI?"), remembers the answer on the device
  (`lib/videoPref.js`), and when video is off explains that the session won't be scored.

**Reading metrics without a browser:** set `METRICS_API_TOKEN` (32+ random characters) on Railway.
Put the same value in the Claude Code environment as `VICTORY_METRICS_TOKEN`, along with
`VICTORY_API_URL` (the backend base URL), then run `python3 tools/habit_metrics.py 8`. The token
only opens `/api/admin/habit-metrics`.

## iPhone push, post-win invites, video scoring (branch `feature/ios-push-invites-video-scoring`)
- **iPhone push, App Store app:** APNs was already wired. The app no longer shows the system
  prompt on launch (`PushNotificationManager.resume()` only re-registers if push is already
  allowed). `Push/PushBridge.swift` exposes `window.webkit.messageHandlers.victoryPush`, accepted
  only from the main frame of `WEB_APP_URL`, so the web app can ask at a good moment.
  `usePushNotifications` uses the bridge inside the app. Switching push off in Profile deletes the
  token, and that choice survives relaunches.
- **iPhone push, Safari:** iOS only sends web push to Home Screen apps. Added
  `public/manifest.json` (standalone) and icons made from the iOS app icon. In a Safari tab,
  `lib/pushPlatform.js` returns `install-ios`, and the app shows Add-to-Home-Screen steps instead
  of a toggle that doesn't work.
- **When push is asked for:** straight after booking a round (`PushOptIn` under the booking
  confirmation, which promises "we'll remind you"), and from the Profile switch.
- **Squad invite link, only after a win:** `BringYourCrew` appears in `SessionRewards` only when
  `inviteMoment()` finds a win (new PB, a callout beaten, a rank-up, or a rare/epic report). It
  never appears in onboarding, and the server refuses to create an invite until the user has
  completed a scored session. `POST /squads/invites` creates a squad if needed and builds the brag
  from the stored PB (verified on the server, not sent by the client). The link is `/join/<id>`
  and lasts 14 days. The public preview `GET /invites/{id}` is IP rate-limited and returns no
  user IDs. Accepting runs `_join_squad`, which applies the same rules as join-by-code: cap,
  blocks, and the 5-squad limit. It records `invited_by` and pushes "X joined your squad" to the
  inviter. If the link is opened while signed out, the invite is kept until sign-up finishes
  (`lib/pendingInvite.js`).
- **AI scores come from video:** `/ai/analyze-video` sends the round itself to Gemini
  (`analyze_round_video`): a Cloudinary 640px MP4, inline up to 15 MB and through the Files API
  above that, at 4 fps, low media resolution, temperature 0, with a JSON schema.
  - Each skill is scored on a written rubric with timestamped `evidence`, which is shown under
    round scores.
  - Skills the model didn't clearly see twice are `null`. Invented skills and duplicates are
    dropped, and the drill comes from `DRILLS` for the weakest skill it saw.
  - If the model fails or the boxer isn't on camera, the round is unscored and the AI tokens are
    refunded.
  - Competition AI judging used to give GPT-4o the URL as text, so it made scores up. It now
    watches the uploaded video. If it can't, the competition stays open for votes.
- **Railway vars:** `GEMINI_API_KEY` (required; until it's set every round is unscored).
  Optional: `GEMINI_VIDEO_MODEL` (default `gemini-2.5-flash`; falls back to `gemini-flash-latest`
  on 404), `GEMINI_VIDEO_FPS` (4), `GEMINI_MEDIA_RESOLUTION` (`low`/`medium`/`high`). Cost is
  about 50k input tokens per 3-minute round at the defaults.
- Tests: `backend/test_invites.py`, `backend/test_video_scoring.py` (mocked Gemini), and
  `lib/pushPlatform.test.js`, `lib/pendingInvite.test.js`, `lib/rewards.test.js`.

## New-interface hooks (branch `feature/live-coach-and-native-hooks`)
None of these add a per-use cost.
- **Live Coach** (Train → toggle, on by default since `feature/smart-defaults`, remembered on the device):
  - `hooks/useLiveCoach.js` runs MediaPipe Pose (lite) on the camera preview, on the phone
    itself. It's loaded from jsDelivr at a pinned version (1.0.1), not bundled. No frame is
    uploaded, and the camera can be on with recording off.
  - `lib/liveCoach.js` (unit tested) counts punches (elbow straightening), combos (≤800 ms
    apart), guard drops (wrists below shoulder height for 400 ms or more) and head movement
    (nose off the shoulder midline).
  - Spoken cues ("Hands up", "That's it") use the browser's free `speechSynthesis`, at most one
    per kind every 8 seconds.
  - Each round is saved with `POST /training/{id}/live-round`. On complete the session gets
    `live_stats`, plus `live_records` for most punches in a round and longest combo.
  - **These counts never touch scores, personal bests or seasons.**
- **Ghost round:** the best live round at each round length is stored in `ghost_rounds`
  (`GET /training/ghost`). During a round the overlay shows the fighter's punch count against
  the ghost's count at the same second.
- **Fighter card:** after a win (`inviteMoment`), "Share your fighter card" draws a 1080×1920 PNG
  on a canvas (`components/FighterCard.jsx`, content from `lib/fighterCard.js`). It uses only
  server-verified numbers; live punches are marked "*counted on the phone". It's shared with the
  Web Share API, or downloaded where that isn't available.
- **iOS app** (see `ios/SETUP.md`):
  - AirPods head tracking (`victoryMotion` bridge).
  - The round clock as a Live Activity (`victoryRound` bridge).
  - Push-to-start countdowns: a booked round 30 minutes before, and a callout's last 8 hours for
    everyone who accepted it, skipped in quiet hours (`_start_booking_countdowns`,
    `_start_callout_countdowns`).
  - Siri shortcuts.
  - The widget extension needs its own profile; until `WIDGET_PROFILE_NAME` is set, TestFlight
    builds leave it out.
- **Not built:** an Apple Watch app (a separate watchOS target and profile; worth doing after
  launch) and a live voice coach (costs money per minute).
- Account deletion now also removes `live_activity_tokens`, `ghost_rounds` and `squad_invites`.

## Defaults (branch `feature/smart-defaults`)
Most people never change a default, so each one is set to the choice that helps both the
fighter and the scaling metrics:

| Default | Was | Now | Metric it serves |
|---|---|---|---|
| Live Coach | off | **on** (runs on the phone, uploads nothing) | sessions with a reward, return rate, `pct_live_coach` |
| Next-round booking | nothing selected | **"Same time tomorrow"** selected, so it's one tap | bookings made and kept (`kept_rate`), share of sessions started without a push (`pct_direct`) |
| Go Live audience | Everyone | **Squad only** when the fighter has a squad | reactions per stream, safeguarding |
| Round length (new fighters) | 3 min | **2 min** (junior amateur standard) | first-session completion |
| "Get scored by AI?" | equal buttons | **"Turn on" is the primary button**, still a real choice | `pct_recorded` |

**Deliberately unchanged,** because they're high-privacy defaults the UK Children's Code expects
for under-18s:
- video upload stays opt-in;
- streams and clips are never public without a choice.

`tools/habit_metrics.py` now shows a `% coach` column. The iOS camera permission text covers Live
Coach as well as recording.

## Fighter identity: positive coaching feedback (branch `feature/fighter-identity`)
- **Goal:** fighters come back because they see themselves as boxers ("I'm an Iron Guard"),
  not because they were reminded.
- **Psychology:**
  - **Self-perception theory:** people infer who they are from what they've seen themselves do.
  - **Labelling effect:** a specific label someone has earned pulls their behaviour towards it.
  - **Process praise:** praise the behaviour, not talent, to keep effort up.
  - **Credibility:** praise needs evidence to be believed.
  - **Primacy:** the first thing read frames everything after it.
- **Design:**
  - **Trait per session:** after each session the coach awards one trait it has evidence for
    (`identity_evidence`).
    - The traits: Iron Guard, Sharp Jab, Slick, Relentless, Combination Puncher, Finisher,
      Clean Mover, Shows Up.
    - The evidence: verified AI scores of 7 or more, live counts, or 3+ sessions this week.
    - The least-earned trait wins, so the fighter's sense of themselves widens and a new trait
      stays a surprise.
    - Counts go in `users.identity_traits`.
  - **`IdentityCard`** opens the results screen with the trait, the evidence ("Guard Position
    8/10"), "4th time" and the fighter's top traits.
  - **A first-time trait counts as a win,** so the fighter card and invite appear, and the card
    shows the trait.
  - **Between rounds,** Live Coach adds one specific line about the round (`lib/identity.js`).
  - **Gemini's `what_did_well`** must name a timestamped moment and what it says about the
    fighter they're becoming.
  - **Public profiles** show the top 3 traits next to titles.
- Tests: `backend/test_identity.py`, `lib/identity.test.js`, `lib/rewards.test.js`, `lib/fighterCard.test.js`.

## Founder price reminders and the cancel flow (branch `feature/founder-price-billing`)
- **Goal:** keep founders (waitlist users with the lifetime `STRIPE_FOUNDERS_COUPON_ID` discount)
  subscribed, without making cancelling harder than one honest extra screen.
- **Psychology:**
  - **Endowment effect:** a price someone feels they already own is valued more. Ownership is
    first felt straight after purchase.
  - **Loss aversion:** a concrete loss shown at the moment of decision weighs about twice as much
    as the same gain.
- **Design:**
  - **Straight after purchase:** `PaymentSuccess` shows `FounderLockedCard`: "$3/month ~~$5~~ ·
    yours for life while you stay subscribed · cancel and it's gone, coming back costs $5,
    about $24 more a year". It waits for a tap instead of auto-redirecting.
  - **Cancelling:** `/billing` (Profile → Subscription) is the first subscription UI in the app.
    It shows plan, price, founder badge and renewal date.
    - "Cancel subscription" opens one confirm screen with the exact loss. "Keep my founder price"
      is the primary button and "Cancel anyway" is one tap.
    - Cancelling is cancel-at-period-end through Stripe, so access continues until then.
    - Until that date there's a "Stay subscribed and keep $3/month" button (resume).
- **Truthfulness:**
  - The page only says "for life" when the subscription in Stripe actually carries the founders
    coupon and that coupon's `duration` is `forever`. **Check this in the Stripe dashboard
    (Products → Coupons).**
  - Founder promo codes are single-use (`max_redemptions=1`), so the loss is real.
  - Checkout previously re-applied a spent code, which Stripe rejects. It now skips spent codes,
    so a returning founder can still subscribe at the regular price.
- **Endpoints:** `GET /subscription/billing`, `POST /subscription/cancel`,
  `POST /subscription/resume`. The `customer.subscription.updated` webhook now syncs
  `cancel_at_period_end`.
- **In the iOS app:** the page is read-only (no Stripe controls in the app, under Guideline
  3.1.1).
- Analytics events: `subscription_cancel_started`, `subscription_cancel_kept`,
  `subscription_cancel_confirmed`, `subscription_resumed`. Save rate = kept ÷ started.
- Tests: `backend/test_billing.py` (Stripe mocked), `lib/billing.test.js`.
- **Matching the waitlist site (victoryai.co.uk):**
  - **Already matching:** $5/month, $25/year ("Save 58%"), 10,000 free AI credits, and 40% off
    for founders.
  - **Trial length:** the site's form promises waitlist sign-ups a "30-day Pro trial", but checkout
    gave everyone 14 days. Founders with an unspent code now get `FOUNDER_TRIAL_DAYS = 30`; everyone
    else gets 14.
  - **Paywall:** `GET /payments/offer` gives the paywall the exact price and trial checkout will
    use. Founders see ~~$5~~ $3 and ~~$25~~ $15, "locked in for life", and the 30-day trial.
  - **WhatsApp number:** the site sends `phone`, which the backend used to drop. It's now stored on
    the `waitlist` entry and forwarded to n8n.
- **Not fixable from this repo (the site is a Lovable project):**
  - the footer's Terms of Service link (`/terms-of-service`) is a 404;
  - "437 / 1,000 spots claimed" and "563 spots left" are hardcoded, not live;
  - founder codes have no 1,000 cap in the backend, although the site says "first 1,000".
- **Stripe products were ignored by checkout** until `feature/gbp-pricing-founder-cap`; see below.

## GBP pricing, founder cap and the public pricing API (branch `feature/gbp-pricing-founder-cap`)
- **Prices now match the Stripe catalogue:** Victory AI Pro is £3.99/month and £24.99/year
  (`PLAN_CURRENCY = "gbp"`). The old $5/$25 was wrong. The founders coupon is 40% off forever, so
  founders pay £2.39 and £14.99. "Save 48%" replaces "Save 58%".
  - **Charging the catalogue Prices directly:** set `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_ANNUAL`
    on Railway to the catalogue's Price IDs.
  - **Without those IDs,** checkout falls back to inline GBP `price_data` at the same amounts.
  - **Not touched:** token packs, gifts and ad checkouts are still USD; they aren't Pro plans.
- **App copy:** all 10 locales changed from $ to £ (including languages that write the symbol after
  the number). The paywall now renders every price from `GET /payments/offer`, not hard-coded
  numbers. The Terms page states GBP.
- **Founder cap:** `FOUNDER_SPOTS_LIMIT` (default 1000), enforced with an atomic counter
  (`counters/founder_spots`). The counter is seeded from existing waitlist entries that have codes.
  After the cap, people still join the waitlist but get no founder code. A failed Stripe code gives
  its spot back.
- **Public endpoints for the waitlist site:**
  - `GET /api/waitlist/stats` returns `{limit, claimed, remaining}`.
  - `GET /api/pricing` returns the GBP plans, founder pricing, live spots and daily GBP rates
    (open.er-api.com, cached 12 hours, attribution required) for showing an approximate local price.
  - Signup responses now include `founder` and `founder_spots`.
- **Lovable prompt** for the site changes is in `docs/lovable-waitlist-prompt.md`: the Terms 404, the
  live counter, prices from the API in the visitor's currency, and consistent trial copy.
- **Public-read CORS:** `GET /api/pricing` and `GET /api/waitlist/stats` return
  `Access-Control-Allow-Origin: *` (`_PublicReadCorsMiddleware`), so Lovable's preview can read them.
  Every other endpoint, sign-ups included, stays limited to `CORS_ORIGINS`.
- **Repeat sign-ups:** a second sign-up with the same email now returns `founder` and `founder_spots`
  too, so the site doesn't show the "founding pricing has run out" message to an existing founder.

## Fantasy Boxing sidecar (branch `feature/fantasy-boxing-sidecar`)
- **What it is:** a free, zero-wagering fantasy game on the stream page, shown as a Chat | Fantasy
  tab under the player. Draft a stable of 3 from the fight card on a fictional 100M budget, score on
  official results only, and rank against friends.
  - No entry fee, tokens, prizes or paid boosts, so it stays halal (no maysir) and safe for teens.
- **Scoring** is in `lib/fantasyScoring.js` (pure functions, unit tested):
  - **Base:** KO/TKO/DQ win +20, UD +15, SD/MD +10, TD/NC +5, loss 0.
  - **Knockout bonuses (KO/TKO only, not DQ):** R1–4 +10, R5–8 +5, R9–12 +2.
  - **Clean sweep:** +10.
  - **Assumption:** an ordinary draw scores like TD/NC (+5).
  - Picks lock when the first bout starts. Ties share a rank.
- **Data** comes from `lib/fantasyService.js`, currently an in-memory mock: a fictional 5-bout card
  and 5 mock friends. Locked picks are saved in localStorage.
  - **The interface** is `getSnapshot`, `subscribe`, `saveStable`, `admin.*`,
    `applyServerBout` and `applyServerLeague`.
  - **Going live:** swap the mock internals for the REST endpoints and WebSocket messages
    documented at the top of the file. The components and `hooks/useFantasyLeague.js` don't
    change.
- **UI:** `components/fantasy/`. `FantasySidecar` holds the tabs; the panels are `DraftPanel`,
  `ScorecardPanel`, `LeaguePanel` and `AdminPanel`.
- **Off for viewers by default** while it runs on mock data:
  - set `REACT_APP_FANTASY_ENABLED=true` on Vercel, or add `?fantasy=1` to a stream URL, to show it;
  - the Admin test tab needs `?fantasyAdmin=1` (always on in dev builds).
- Tests: `lib/fantasyScoring.test.js` (10) and `lib/fantasyService.test.js` (6). The full flow was
  checked in Chromium in light and dark mode: over-cap warning, lock-in, a KO R2 with clean sweep
  scoring 40, and a simulated card moving the league.
- **Simplified so a 7-year-old understands it** (Fogg's simplicity factor "brain cycles" plus
  Hick's law):
  - **Words:** "boxers" and "team" instead of fighters and stable, pretend "coins" instead of
    "$100M", and plain result wording ("Won by knockout in round 2", "Won on points — all judges
    agreed"). A test checks no boxing codes reach players.
  - **Tabs:** named in order, "1. Pick", "2. My team", "3. Friends".
  - **Guidance:** a three-step "how to play" with a five-row points table, a "2 of 3 boxers
    picked" count, and errors that say how to fix them.
  - **Admin:** the admin tab keeps the boxing codes, because results-desk staff use them.

## Fantasy Boxing on real fights (same branch)
- **Data source:** the **Boxing Data API** (boxing-data.com via RapidAPI), not BoxRec. BoxRec has
  no licence for automated use and blocks scraping.
  - It covers **pro** records and results only. No licensed amateur feed exists, so amateur cards
    are entered by an admin at `/fantasy/admin` from the club or promoter sheet.
  - **Plan needed:** at least **Ultra ($99/month)**; **Mega ($249/month)** if UK small-hall
    cards aren't fully covered.
  - **Railway env:** `BOXING_DATA_API_KEY` (required), `BOXING_DATA_HOST` (default
    `boxing-data-api.p.rapidapi.com`), `ADMIN_INBOX_EMAIL` (default `hello@victoryai.co.uk`).
    `RESEND_API_KEY` is needed for the admin emails.
- **Automatic** (`_fantasy_loop` in `server.py`, logic in `backend/fantasy_engine.py`):
  - **Hourly import:** every UK card and every world-title card (WBC, WBA, IBF, WBO, undisputed or
    Ring) in the next 14 days. Fighter records are cached for 7 days.
  - **Prices** come from records only, never betting odds. A smoothed win rate, KO rate,
    experience and how often a boxer was stopped give a rating. A logistic curve (25 rating points
    ≈ 10:1) turns that into a price from 10 to 50 coins. Prices freeze when the card starts.
  - **Every 5 minutes:** statuses and official results for cards from yesterday to tomorrow.
    - PTS scores as UD and RTD as TKO.
    - A clean sweep is any judge's card where the winner scored 10 × the rounds.
    - An outcome the feed can't map is never guessed: the bout is held and the admin is emailed.
    - An admin's result always overrides the feed.
  - **When a card finishes,** each player gets a push with their score.
- **Player API:**
  - `GET /api/fantasy/cards` and `GET /api/fantasy/cards/{id}`;
  - `PUT /api/fantasy/cards/{id}/stable` (the server repeats the cap and lock checks);
  - `GET /api/fantasy/cards/{id}/leaderboard?league=squad|<league_id>` (squad = squad mates).
- **Pro perks** (`check_subscription`):
  - **Private leagues:** `POST /api/fantasy/leagues`, up to 5 per owner and 50 members. Joining by
    code is free (`POST /api/fantasy/leagues/join`).
  - **Season standings:** `GET /api/fantasy/season`, over 90 days.
- **Admin emails:** `ADMIN_EMAIL` (archieroach2013@gmail.com) is the only admin **login**.
  `ADMIN_INBOX_EMAIL` (hello@victoryai.co.uk) is the **official inbox**: feedback, crash reports,
  content reports and all fantasy notices go there, and it's the address shown to the public.
  It can't sign in to admin tools.
- **Monetisation.** Every deal is agreed by email to `ADMIN_INBOX_EMAIL` and then switched on by
  hand:
  - **Sponsored leagues:** sponsors use the public form at `/fantasy/partners`
    (`POST /api/fantasy/enquiries`, rate-limited and honeypotted). Sponsors must confirm they aren't
    in gambling, alcohol or interest-based lending. The admin then sets a "Presented by" credit.
  - **Promoter deals:** the admin features a card, or imports any event by its Boxing Data id
    (`POST /api/admin/fantasy/feature`).
  - **Cosmetics, bought outright:** Gold Gloves, Title Belt, corner colours and team name, priced
    £0.99–£2.99. A player taps a price, the admin is emailed and sends a payment link, then grants
    the item (`POST /api/admin/fantasy/cosmetics/grant`). Cosmetics never change points. The
    purchase button is hidden in the native app (App Store rule 3.1.1).
  - **Never:** entry fees, prizes paid for by players, paid boosts or random boxes. Any prize a
    sponsor funds needs scholar and legal review first.
- **Frontend:**
  - `/fantasy`: fixture list, the same Pick, My team and Friends game, a league switcher, Season
    (Pro) and Team looks. There's a "Fantasy" pill on the Live page.
  - `/fantasy/partners` (public) and `/fantasy/admin` (admin accounts only).
  - `lib/fantasyApi.js` is the live service. It polls every 15 s while fights are on and every
    60 s before. The stream sidecar still uses the mock until streams are linked to cards.
- **Tests:** `backend/test_fantasy_engine.py` (8), `backend/test_fantasy_api.py` (9, with the feed
  and email mocked) and `frontend/src/lib/fantasyApi.test.js` (2).

## Low-cost data mode (default)
- **Feed scope:** `FANTASY_FEED_SCOPE=world_title` (default) imports world-title cards only. UK
  small-hall cards come from promoters instead. Set `all` to import UK shows from the feed too.
- **Request budget:** `BOXING_DATA_MONTHLY_LIMIT` (default 100, the free plan).
  - Every feed call is counted in `counters/boxing_data_YYYY-MM`.
  - At the limit the feed pauses until next month, so there's never an overage bill.
  - The admin is emailed at 80% and at 100%.
- **Fewer calls:**
  - The schedule is imported every `FANTASY_IMPORT_HOURS` (24).
  - Records are cached for `FANTASY_FIGHTER_TTL_DAYS` (30).
  - Picks lock on the clock at the card's start time, with no feed call.
  - Results are checked only from the start to +12h, every `FANTASY_RESULTS_MINUTES` (90), plus
    one check the morning after.
  - Expected cost is roughly 60–100 requests a month for about 4 world-title cards.
- **Small cards:** a card with 1 bout picks 1 boxer with 50 coins, and 2 bouts pick 2 with 80
  coins. This matters because cheaper feed plans only return the top fights on a card.
- **Promoter-supplied cards:**
  - On `/fantasy/partners`, a promoter can paste their card, one fight per line with records
    (`lib/parseCard.js`). It becomes a hidden draft (`fp_…`), and the admin is emailed.
  - The admin taps **Publish** in `/fantasy/admin`. The promoter is then emailed a private link,
    `/fantasy/results/{card_id}?t=…`, where they lock picks at the first bell and enter each
    result.
  - Admins can also paste a card into the manual card form.
- **Free plan:** the feed's free plan refuses upcoming-fight requests (`DateOutOfRange`). The first
  refusal pauses the daily import for that month (`counters/boxing_data_paused_YYYY-MM`) and emails
  the admin once, so the 100 free requests aren't wasted. `/fantasy/admin` shows the feed's state
  (`GET /api/admin/fantasy/feed-status`).
- **Practice card:** when there are no real cards, `/fantasy` offers a practice card (demo boxers,
  simulated results) and a link to add your own fight in `/camp`.
- **Tests:** `backend/test_fantasy_lowcost.py` (8) and `frontend/src/lib/parseCard.test.js` (2).

## Fantasy runs itself (automation)
- **Admin routine:** answer sponsor and promoter emails, approve a promoter's *first* card, and read
  the Monday email. Nothing else.
- **Cosmetics through Stripe:**
  - Tapping a price calls `POST /api/fantasy/cosmetics/{id}/checkout`, which opens Stripe checkout
    (GBP, bought outright).
  - Once paid, the item switches on through the webhook (`purchase_type=fantasy_cosmetic`) or
    through `GET /api/fantasy/cosmetics/confirm` when the buyer returns.
  - Under-18s (or unknown age) get the same link to share with a parent, and their email isn't
    pre-filled.
  - Buying stays hidden in the native app.
  - The Stripe webhook must send `checkout.session.completed`, which it already does for tokens.
- **Trusted promoters:**
  - Publishing a promoter's first card trusts them (`fantasy_promoters`) and emails two private
    links: the results link, and a submit link (`/fantasy/partners?promoter=KEY`).
  - Cards sent through the submit link go live immediately, and the admin gets an FYI email.
  - The admin can Unpublish any card.
- **Results (`_fantasy_ops_loop`, every 30 minutes, 08:00–20:00 UK time):**
  - The day after a promoter or manual card, a reminder goes to the promoter.
  - After 3 days, unreported bouts close as `VOID` ("No result recorded", 0 points), and the admin
    is told.
  - Amateur fights left unreported for 7 days close the same way.
  - A late real result always replaces `VOID`.
- **Weekly email:** Mondays from 09:00 UK time, hello@ gets "Your weekly to-do" listing promoter
  cards to approve, deal enquiries not marked Done, cards missing results, and the feed state.
  Nothing outstanding means no email.
- **Tests:** `backend/test_fantasy_automation.py` (7).

## My boxing: fight camp, amateur record and training buddy (same branch)
- **Page:** `/camp` ("My boxing", linked from Profile). Backend section: `FIGHT CAMP + AMATEUR
  RECORD` in `server.py`.
- **Booking:** the boxer adds their next fight: date, show, opponent and their record, rounds,
  fight weight, up to 3 camp goals, and an opt-in to Fantasy. Up to 3 fights can be booked at once.
- **Buddy timetable** (`_buddy_loop`, hourly, only 08:00–20:00 UK time):
  - **Camp check-ins:** at 42, 28, 21, 14, 10, 7, 4 and 2 days out. Each one asks about one of the
    camp goals in turn. Checkpoints that had already passed when the fight was booked never fire
    late.
  - **Results:** "How did it go?" the day after the fight, and once more 3 days after.
  - **Messages:** stored in `buddy_messages`, sent as a push from the training partner's name, and
    shown on `/camp`.
- **Check-in replies** are built only from what the boxer entered: sessions against last time,
  total sparring rounds this camp, kg against fight weight, and low energy.
  - The buddy never coaches weight cutting. Adults are told "plan it with your coach — never by
    drying out"; under-18s are told "tell your coach".
- **Results:**
  - `POST /api/amateur/fights/{id}/result` adds one to the record. It only works from fight day,
    and is guarded so a double tap can't count twice.
  - The same result scores the fantasy card.
- **Records:**
  - Records are self-reported until the gym owner verifies them on `/camp`
    (`/api/amateur/verify-queue`, `/api/amateur/verify/{user_id}`).
  - Any later change shows as unverified, with the last verified record kept.
  - Public profiles say "Verified by {gym}" or "Self-reported".
- **Fantasy:**
  - There is one card per gym per week of fights (`fa_{gym}_{week}`). Prices use the same formula
    as pro cards. Team size and budget shrink on small cards (1 bout means pick 1 boxer with
    50 coins). Picks lock on fight day.
  - **Under-18 (or unknown age), or a private profile:** the card is visible only to the boxer's
    gym and squad. The venue is never shown.
- **Training partners:**
  - **Opt-in flags:** sparring, pad work, training partner, promoting together
    (`PUT /api/amateur/open-to`).
  - **Search:** `GET /api/amateur/partners`. Gym-mates come first; under-18s appear only to their
    own gym.
- **Tests:** `backend/test_amateur_camp.py` (7).

---

# Previous: Bug-Hunt Pass

## TL;DR
A full adversarial bug hunt was run across the whole codebase (backend `server.py` +
all frontend pages/components) by three parallel reviewers; every high-severity finding
was re-verified against source. **All 6 critical + 10 high findings, plus 18 medium/low,
are fixed and committed to a branch.** Nothing is pushed; `main` is untouched.

- **Branch:** `fix/bug-hunt-security-and-crashes`
- **Commit:** `b8fb92c` — 21 files, +485 / −184
- **NOT build-tested** — this machine had no Node/Python toolchain. Build before merging.

## How to ship it (do this next)
```bash
cd frontend && npm install && npm run build     # MUST pass before merging
# backend: start uvicorn locally and smoke-test the endpoints listed below
git checkout main && git merge fix/bug-hunt-security-and-crashes
git push origin main                              # auto-deploys Vercel + Railway
```

### ⚠️ Deploy gotcha (breaking change)
The Stripe webhook (C1) now **refuses to run without `STRIPE_WEBHOOK_SECRET`** — it returns
500 on missing secret and 400 on bad signature (previously it trusted unsigned JSON, a
free-token exploit). **Confirm `STRIPE_WEBHOOK_SECRET` is set on Railway before deploying**,
or token/gift/ad-campaign fulfilment webhooks will fail.
Optional new env var: `LIVEPEER_WEBHOOK_SECRET` (if set, Livepeer webhooks are HMAC-verified;
if unset, behavior is unchanged).

## What was fixed

### Critical
- **C1** `backend/server.py` webhook — reject unsigned/forged Stripe events.
- **C2** `send_tip` + `purchase_emote` — atomic guarded debit
  (`{"token_balance": {"$gte": amt}}` + `matched_count` check). Kills double-spend / negative
  balance. Also blocks self-tipping.
- **C3** tip + gift broadcasts were double-`json.dumps`'d (the WS manager already serializes) →
  events silently dropped client-side. Now pass raw dicts; paid punch alerts / tip chat / gift
  banners render again.
- **C4** `/payments/status` created a `trialing` subscription for ANY completed checkout →
  buying tokens granted free Pro. Now gated on `session.mode == "subscription"`.
- **C5** Added missing `POST /sessions` (manual scorecard flow was hitting 405). Shapes the
  response to what `SessionResultsPage` reads.
- **C6** `/ads/checkout` referenced undefined `STRIPE_SECRET_KEY` (→ `STRIPE_API_KEY`) and used
  `asyncio` with no import (now module-level). Endpoint was 500-on-every-call.

### High
- **H1** `frontend/src/App.js` — `import { toast } from "sonner"` (402 quota interceptor threw
  ReferenceError).
- **H2** `check_and_consume_ai_tokens` — atomic `$inc` reservation instead of `$set` on a stale read.
- **H3** module-level `import asyncio` — also fixes `share_post` NameError when sharing others' posts.
- **H4** `create_clip` now records `streamer_id`/`streamer_name` (viewer-clipping is an intended
  feature; the bug was missing attribution, not access).
- **H5** Competition winner logic was dead code (an earlier guard always fired first). Extracted
  `_close_competition_if_due()` — atomic single-award, no phantom loser — called on vote + lazily
  on competition list/detail reads (acts as the sweeper). Winners + belts now actually awarded.
- **H6** `TokenSuccessPage` / `PaymentSuccess` — new `refreshUser()` in App.js refreshes the user
  WITHOUT toggling global `loading` (which was unmounting the page in a re-poll loop). Timers now
  cancelled on unmount; over-optimistic "credited" copy softened.
- **H7** `StreamViewPage` — real error state for 403/500/network (was blank black screen); token
  balance fetch decoupled from the required stream fetch.
- **H8** `GoLivePage` — stop camera tracks if unmounted mid-permission; try/catch around WebRTC
  setup; `onconnectionstatechange` handler; double-click guard (`startingRef`).
- **H9** `OnboardingFlow` — reset naming-step `loading` in `finally` (was bricking on transient 500).
- **H10** `TrainPage` — completion always resolves (navigates home if no session saved) instead of
  freezing at 0:00; warns when `/training/start` failed.

### Medium / Low (see commit for full list)
Scheduled-stream naive datetime crash; leaderboard empty-name IndexError + true rank for users
outside top 50; analyze-video owner-scoped update; Livepeer webhook signature (opt-in); gym
member_count atomicity; vote-score key sanitization; chat history newest-50 + `user_id`
propagation; clip deep links (`/clip/:postId` now reads the param); Library filters work
client-side; paywall trial copy 7→14; StreamerDashboard buckets long ranges; LiveFeed "Recent"
queries `idle` not `ended`; crash guards (SessionCard, SessionResults); ProfilePage/FeedPage/
TipModal UX desyncs; LiveChat gift keys; CreatePost compete-mode validation.

## Deliberately NOT done (candidates for next session)
- **Dead/unrouted pages** — `FighterBuddyCreator.jsx` (calls non-existent `/fighter-buddy/*`),
  `OnboardingQuiz.jsx` (nav to non-existent `/onboarding/fighter`), `AuthCallback.jsx` (unrouted,
  `login` is a no-op stub). Left as-is; delete or wire up before re-enabling.
- **StrictMode side-effects-in-updater** — `TimerPage`/`TrainPage` call `playBell()`/dispatch inside
  `setTimeLeft(prev => …)`. Dev-only symptom (double bell / skipped round under StrictMode); prod
  invokes updaters once. Proper fix = move transitions into an effect keyed on `timeLeft`; skipped
  to avoid a risky timer rewrite in this pass.
- **i18n** — the whole token/streaming surface (TokensPage, TipModal, LiveChat, etc.) is hardcoded
  English despite 10 locales. Large standalone cleanup; only the paywall trial-copy contradiction
  was fixed.
- **M8 partial** — the hype-interval leak is fixed; the broader updater purity (above) is not.

## Verification checklist (after build passes)
Backend: forge an unsigned webhook (must 400/500); two concurrent tips vs a 100-token balance
(must end ≥0, one success); buy tokens then assert NO subscription row; submit a scorecard (200 +
results render); share another user's post (200 + push, no 500); vote a competition past deadline
(winner + belts awarded once, no loss on the host).
Frontend: exhaust AI quota (upgrade toast, no ReferenceError); tip on a live stream in a 2nd
browser (PunchAlert + chat + TopKnockouts appear); complete a token purchase (correct success
card, balance updates, no spinner loop); start a workout offline (graceful, not frozen); go live
then navigate away during the permission prompt (camera light off).

## Repo facts (unchanged from prior handoff)
Frontend: React (CRA+CRACO), JS `.jsx`, Vercel (`victory-ai-alpha.vercel.app`). Backend: FastAPI +
Motor (async MongoDB), Railway. Auth: Clerk JWT. Pages import `{ API, useAuth } from "@/App"`.
`git push origin main` auto-deploys both. Pollinations images, Livepeer streaming (WHIP needs
`follow_redirects=True`, 307 is normal), Stripe payments, token economy on `token_balance`.
