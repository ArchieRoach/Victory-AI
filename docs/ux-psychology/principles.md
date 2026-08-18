# UX Psychology Principles — Victory AI

A standing reference for the psychological principles behind Victory AI's UI/UX, and where the
app currently stands against each. Audited against the real codebase 2026-07-29. Future daily
maintenance passes should check new/changed screens against this doc alongside `DESIGN.md`.

**Status legend**: ✅ Already meets this · 🟡 Partial gap · 🔴 Clear gap · ⚠️ Flagged, not implemented (see note)

---

## 1. Cognitive Architecture & Reducing Friction

### 1.1 Icon + text labels on navigation — ✅ Already meets this
Every primary nav item (Live, Discover, Home, Train, Profile) pairs an icon with an explicit text
label underneath (`BottomNav.jsx`). Re-checked 2026-07-31 against every other tab-bar-style
control in the app (`ProfilePage`, `PublicProfilePage`, `GymsPage`, `GymDetailPage`,
`CompetitionsPage`, `HomePage`) — all either pair icon+label the same way or are plain-text tabs
(inherently labeled). No gap anywhere in the app.

### 1.2 Readability & chunking (Miller's Law) — ✅ Fixed 2026-07-31
Re-audited the actual long-form content: AI feedback (`TrainPage`, `SessionResultsPage`) was
already well-chunked — short icon-prefixed blocks in a `space-y-*` stack, not paragraphs — no
change needed there. `PrivacyPolicyPage.jsx` already had headings (`Section` component), bold
keywords (`<strong>` throughout), and a `max-w-lg` container. The one real gap: the page's contact
email was styled as plain text, not an actual link. **Fixed** — it's now a proper underlined
`mailto:` anchor. Confirmed via a full-codebase grep that this was genuinely the only link-shaped
element in the entire app (zero `<a href>`/`mailto:` elsewhere), so no other link styling was
needed.
**Known follow-up, out of scope today**: most pages have no `max-w-*` wrapper on their content
(only 8 of 35 do), so line length is bounded by mobile viewport width today but would run
edge-to-edge on a wide desktop browser window. Fixing this properly means a shared layout
constraint, not a per-page patch — a good candidate for its own pass rather than folding into a
text-content fix.

### 1.3 Minimize form friction (decision fatigue) — ✅ Fixed 2026-08-04
The onboarding flow already used the right pattern — one single-tap choice per screen, not a
multi-field form. What it hadn't done was question *whether every question earned its place*.
Traced each of the 8 "why-hook" fields to its actual use: `why_downloaded`, `heard_from`, and
`training_frequency` were collected into `onboarding_answers` and then never read again — not in
the personalization/affirmation logic, not in any AI prompt, not surfaced on any admin or profile
view. Pure write-only data with zero product payback. **Cut all three** — from the frontend
`questions` array, the backend `OnboardingAnswers` model, and the now-orphaned i18n keys (all 10
locales). The why-hook sequence goes from 8 questions to 5; total onboarding screens (birth-date
gate → why-hook → partner creation → naming) drops from 13 to 10.
Kept: `boxing_stance` (personalizes the next question's options), `biggest_frustration` and
`favorite_counter` (both feed the post-quiz personalized-affirmation copy), `experience_level`
(used pervasively — stats, feedback prompts, badge thresholds), `favorite_fighter` (feeds the AI
avatar-generation prompt, and is correctly reused rather than re-asked at avatar-generation time).
Also checked every other user-facing form (gym creation: 2 fields, already minimal; advertiser
signup: 4 fields, reasonable for a B2B lead form and can't reuse app-user data since advertisers
aren't necessarily logged in; go-live: no manual title/description fields at all) — no other gaps
found. No redundant re-asking of already-known data anywhere.

### 1.4 Familiar mental models (Jakob's Law) — ✅ Already meets this
Bottom nav, top search (`DiscoverPage`), standard back arrows, high-contrast primary CTAs — all
conventional placements. No gap found.

---

## 2. Visual Hierarchy, Attention, & Fitts's Law

### 2.1 Touch target size — ✅ Already meets this (actively maintained)
This is the most thoroughly-addressed goal in the whole framework — eight consecutive daily
maintenance passes (2026-07-22 through 07-29) have driven near-universal 44–48px touch targets
(`touch-target` class = `min-h/w: 48px`) and `aria-label` coverage on icon-only buttons across the
app. Keep this in the maintenance sweep's standing checklist — it's a solved problem that stays
solved through repetition, not a one-time fix.

### 2.2 Visual distinction for primary vs. secondary actions — ✅ Already meets this
`victory-lime` (high-contrast) for primary actions vs. `victory-btn-ghost`/muted styling for
secondary actions is applied consistently across the design system. No gap found.

---

## 3. Perceived Performance & Loading States

### 3.1 Skeleton screens — ✅ Already meets this
`skeleton-shimmer` / `Skeleton` components are used across 12+ pages (Feed, Home, Library,
Competitions, Leaderboard, Gyms, Sessions, Trending Clips, etc.). Strong, consistent coverage.

### 3.2 Blur-up progressive image loading — ✅ Fixed 2026-07-29
Added a reusable `<ProgressiveImage>` drop-in `<img>` replacement
(`frontend/src/components/ProgressiveImage.jsx`): fades in on load, shows a blurred low-res
placeholder for Cloudinary-hosted images (via an on-the-fly `e_blur:1000,q_1,w_50` transform on
the same URL) or a `skeleton-shimmer` placeholder otherwise, and sets native `loading="lazy"`.
Applied to the highest-traffic avatar/thumbnail sites: `ProfilePage`'s main avatar,
`PublicProfilePage`'s two avatars, `StreamCard`'s two avatars, and `TrendingClipsPage`'s author
avatar + clip thumbnail. Deliberately **not** applied everywhere — one thumbnail in
`PublicProfilePage`'s clips grid has its own `group-hover` opacity interaction that doesn't
compose cleanly with the component's fade-in yet, and there are other lower-traffic `<img>` sites
left as direct loads. Swapping in the remaining ones is a good next daily-maintenance-pass item —
it's now a known, working pattern, not a new one to invent.

### 3.3 Progress + ETA for heavy waits, optimistic UI — 🟡 Partially fixed 2026-07-29
Correction to the original audit: `ScorePage.jsx` was misread — it already had a full
`AnalysisOverlay` (progress bar + rotating status steps) for its AI-judging wait; that part of the
original finding was wrong. The real gap was narrower: `TrainPage.jsx`'s per-round conversational
feedback (`generateFeedback`/`loadingFeedback`) only showed a bare spinner and one static label.
**Fixed**: added a compact inline progress bar + rotating status text (4 steps, translated to all
10 locales) scoped to that per-round card — not a full-screen takeover, since rounds happen
frequently during a live session and a takeover would be disruptive there, unlike the one-time
onboarding/scoring flows. Progress is simulated (caps at 90% until the real response lands), same
technique as the existing `GeneratingScreen`/`AnalysisOverlay` patterns it's modeled on.
Also fixed: `TrendingClipsPage.jsx`'s `handleLike` now updates optimistically (flips immediately,
reconciles with the server response on success, reverts on error) instead of waiting on the
round-trip before showing any change.

---

## 4. Habit Formation, Variable Rewards, & The Hooked Model — ⚠️ Flagged, not implemented

Sections 4.1–4.3 as written (anticipation-building countdowns before reward reveal, randomized
variable-schedule reinforcement, infinite-scroll/autoplay loops explicitly designed to remove
"conscious decisions to load more") describe intentional habit-forming mechanics. Per explicit
instruction, these are recorded here as observations only — **not implemented, and not recommended
without a separate, explicit product decision.**

**What already exists, unrelated to this framework**: a badge/belt achievement system
(`badges` field on the user doc, `BELT_CATALOGUE`) and skeleton-based perceived-performance
handling. These are ordinary product features, not evidence of intentional variable-reward design,
and shouldn't be read as a step toward 4.1–4.3.

**Why this needs a separate call, not a default yes**: this is a boxing *training* app — the
product's actual value proposition is consistent training habits and honest progress feedback.
Deliberately engineering anticipation/variable-reward loops to maximize session count is a
different design goal than "help the user train more effectively," and the two can conflict (e.g.
a countdown-gated reward reveal adds friction to a user just trying to check their score). Raise
this explicitly if/when it's wanted.

## 5. Investment, Reciprocity, & Social Dynamics

### 5.1 IKEA effect (investment → attachment) — ✅ Already meets this
The AI training partner creation flow is already deeply customizable — style, focus areas,
accountability level, name, and generated avatar (`onboarding/create-partner`,
`onboarding/generate-avatar`). This is a legitimate, already-shipped instance of this principle and
needs no further work.

### 5.2 Reciprocity & social affirmation — 🟡 Partial / ⚠️ mechanics flagged
Likes, comments, and badges already exist as ordinary social features. The specific mechanics
described in the framework (reciprocity-triggering notifications designed to drive "viral cycle
time," prominent affirmation-metric displays after every workout) are engagement-optimization asks
in the same category as Section 4 — flagged as an observation, not implemented, pending an explicit
decision.

### 5.3 Default settings — ⚠️ One default explicitly flagged
Two defaults checked in the actual code:
- Push notifications: **opt-in** — `usePushNotifications` only subscribes on explicit user action,
  never automatically. This is the privacy-positive default and should stay exactly as-is.
- Stream visibility (`StreamCreate.is_private`): defaults to `False` (public). This is a
  streamer-initiated broadcast setting, not personal data exposure, so it's a reasonable default
  for a livestreaming feature on its own terms.

The framework's Goal 5.3 suggestion — "opt users into community sharing for milestones by
default" — is **not implemented and not recommended without an explicit decision**: it runs
directly opposite to the privacy-by-default posture already built for GDPR Art. 25 compliance this
session (see `docs/gdpr/ropa.md`), where the working assumption has been minimal-by-default,
opt-in-for-sharing. Changing that stance for engagement reasons is a real trade-off between growth
and the compliance posture already shipped — worth a deliberate conversation, not a quiet default
flip.

---

## Summary

| # | Goal | Status | Priority if acting |
|---|------|--------|---------------------|
| 1.1 | Nav icon labels | ✅ | — |
| 1.2 | Readability/chunking | ✅ | Wide-viewport max-width is a separate future item |
| 1.3 | Form friction | ✅ | — |
| 1.4 | Familiar mental models | ✅ | — |
| 2.1 | Touch targets | ✅ (actively maintained) | Keep in sweep |
| 2.2 | Visual distinction | ✅ | — |
| 3.1 | Skeleton screens | ✅ | — |
| 3.2 | Blur-up images | ✅ (scoped) | Extend to remaining sites |
| 3.3 | Progress/ETA, optimistic UI | 🟡 (TrainPage fixed) | — |
| 4.1–4.3 | Habit/variable-reward mechanics | ⚠️ Flagged | Needs explicit decision |
| 5.1 | IKEA effect / customization | ✅ | — |
| 5.2 | Reciprocity/affirmation mechanics | 🟡 / ⚠️ | Needs explicit decision |
| 5.3 | Default settings | ⚠️ One flagged | Needs explicit decision |

**Bottom line**: sections 1–3 are in good shape — the codebase's own maintenance history had
already organically solved touch targets and skeleton loading, and the AI-partner customization
flow already nailed the investment principle. The two concrete gaps (3.2 blur-up images, 3.3
progress/ETA + optimistic likes) were fixed 2026-07-29, scoped to the highest-traffic sites rather
than exhaustively — see each section for what's covered and what's left as a follow-up. Sections 4
and 5.2–5.3's engagement-mechanics items are deliberately left as-is pending a separate product
conversation.
