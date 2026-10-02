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
- **Live Coach** (Train → toggle, off by default, remembered on the device):
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
