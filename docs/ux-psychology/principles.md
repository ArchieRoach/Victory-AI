# UX Psychology Principles — Victory AI

A standing reference for the psychological principles behind Victory AI's UI/UX, and where the
app currently stands against each. Audited against the real codebase 2026-07-29. Future daily
maintenance passes should check new/changed screens against this doc alongside `DESIGN.md`.

**Status legend**: ✅ Already meets this · 🟡 Partial gap · 🔴 Clear gap · ⚠️ Flagged, not implemented (see note)

---

## 1. Cognitive Architecture & Reducing Friction

### 1.1 Icon + text labels on navigation — ✅ Already meets this
Every primary nav item (Live, Discover, Home, Train, Profile) pairs an icon with an explicit text
label underneath (`BottomNav.jsx`). No gap.

### 1.2 Readability & chunking (Miller's Law) — 🟡 Partial
Spacing and card-based segmentation are consistent app-wide (`victory-card` pattern), and skeleton
loading states already break content into discernible blocks. Two things not found anywhere in the
codebase:
- No explicit line-length constraint on long-form text blocks (e.g. `PrivacyPolicyPage.jsx`'s
  policy sections, AI feedback commentary) — containers are width-capped (`max-w-lg`, ~512px) but
  that's a container width, not a measured line-length choice.
- No underline/bold-keyword convention for inline text links — low priority, since this is a
  mobile app UI with very few inline text links (mostly buttons), not a content site.

### 1.3 Minimize form friction (decision fatigue) — 🟡 Partial
The onboarding flow already uses the right pattern — one single-tap choice per screen, not a
multi-field form — which is the correct mitigation for this goal. But the total sequence is long:
birth-date gate → 8 single-choice questions (`OnboardingFlow.jsx` `questions` array) → 3 training-
partner-creation steps → naming, all before reaching the app. No redundant re-asking of
already-known data was found. Worth a future look at whether all 8 "why-hook" questions are load-
bearing for personalization, or whether some could be cut/deferred post-onboarding.

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
| 1.2 | Readability/chunking | 🟡 | Low |
| 1.3 | Form friction | 🟡 | Low |
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
