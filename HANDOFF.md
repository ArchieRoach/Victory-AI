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
