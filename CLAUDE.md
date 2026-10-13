# Victory AI

Full-stack boxing-training + live-streaming app. See `HANDOFF.md` for current branch/status.

> **UI rule**: Read `DESIGN.md` before writing any frontend code. All colors, typography, components, and patterns are defined there. Never use generic Tailwind colors or write UI without following the Victory AI design system.
> **Colour rule**: light and dark palettes live only in `frontend/src/theme/theme.js`; `useColorScheme()` follows the phone setting live. Never add per-screen light/dark code or hex colours.
> **Feel rule** (DESIGN.md §12): anything a finger touches answers instantly, moves on springs (`lib/motion.js`), can be grabbed mid-move, and leaves the way it came. Sheets use `BottomSheet`. Haptics only for real moments.

## How to explain things to Archie (the owner)
Explain everything as if talking to a 7-year-old: short sentences, everyday words, simple
comparisons (gyms, stickers, ladders, teams). No jargon unless it's explained in plain words straight
after. This applies to every answer, summary and plan, not just when asked.

## Design rule: Goal → Psychology → Design
Every product decision is written as three parts, and the reasoning is stated, not implied:
1. **Goal**: the outcome it serves (a metric, or one of the three drives for 13–24s: permission
   to show off, visible progress, identity expression).
2. **Psychology**: the principle or observation that supports it (e.g. self-perception, the
   labelling effect, peak-end, defaults/status-quo bias, variable reward, investment).
3. **Design**: how the UI or behaviour applies it.

Put the three lines in the PR description, and in a short code comment where the reasoning is
non-obvious (e.g. `IDENTITY_TRAITS` in `backend/server.py`). Psychology never overrides honesty:
praise and labels must be earned from real evidence, and high-privacy defaults for under-18s stay.

## Invite rule: sell the value before asking for friends
People only want to invite friends once they're sold on the experience themselves, and that
usually happens at the first major win state.
- Never ask users to invite friends (contacts, Facebook, "invite everyone") during onboarding or
  right after sign-up. They don't know yet if they'll like it, won't risk their social capital, and the
  prompt delays their first win.
- Invite and share prompts appear only straight after a real win (PB, callout beaten, rank-up, level-up,
  quest done), and the invite carries that win. Contact matching only runs when the user taps it.
- Guarded by `frontend/src/lib/inviteRule.test.js` (onboarding must not prompt invites, contacts or shares).

## Onboarding rule: make people feel smart, never swamped
New users decide in their first few sessions whether they're "good at this". Onboarding and the
first sessions must build that feeling, not test it.
- Ask only what we use (4 questions + 2 partner steps max). Reflect their own answers back as
  smart choices; promise no results we can't prove.
- The first session is one clear thing: one round with your partner. Features unlock one at a
  time after real sessions (`FEATURE_UNLOCKS` in `backend/gamification.py`, `lib/unlocks.js`),
  each with one plain line explaining it. Newcomers get a short results screen, with the rest
  folded under "See all your numbers".
- Guarded by `frontend/src/lib/onboardingCalm.test.js`.

## Stack
- **Frontend:** React (CRA + CRACO), JavaScript `.jsx` (no TypeScript, no Next.js). Tailwind only.
  Deployed to **Vercel** (`victory-ai-alpha.vercel.app`).
- **Backend:** FastAPI + Motor (async MongoDB). Deployed to **Railway**. Entry: `backend/server.py`.
- **Auth:** Clerk JWT. All pages import `{ API, useAuth } from "@/App"`; a global axios interceptor
  injects the Bearer token (no `withCredentials`).
- **Other:** Pollinations.ai images, Livepeer streaming, Stripe payments, token economy on
  `token_balance`, web-push (VAPID).

## Deploy
- `git push origin main` auto-deploys **both** Vercel (frontend) and Railway (backend).
- On `main`, branch first; commit/push only when asked — pushing `main` = a production deploy.
- Run `/deploy-preflight` before pushing to catch build-breakers in one pass.
- Railway has **Wait for CI** on: it deploys `main` only after the `Backend tests` GitHub check
  (`.github/workflows/backend-tests.yml`, every `backend/test_*.py`) passes.

## Deploy gotchas (learned the hard way)
- **Railway env vars** (`DB_NAME`, `MONGO_URL`, `STRIPE_*`, `LIVEPEER_*`) must be set in Railway's
  Variables tab. A repeated `KeyError: 'DB_NAME'` = missing var, not a code bug.
- **Dockerfile `CMD`** must use `sh -c "uvicorn ... --port $PORT"` so `$PORT` expands (JSON-array
  form leaves it literal → "invalid integer").
- Use a base image with pip (`python:3.11-slim`); nixpacks bases may lack `pip`/`pip3`.
- **`STRIPE_WEBHOOK_SECRET` must be set** or the `/api/webhook/stripe` endpoint 500s (it now refuses
  unsigned events by design).
- Frontend: keep one package manager (commit `yarn.lock`, don't gitignore it); no private/
  unresolvable deps; ensure CRACO/ESLint plugins (react-hooks) are registered.

## Conventions
- Commit messages: short imperative. Branch before committing on `main`.
- No code comments unless they explain a non-obvious **why**; no docstrings.
- Backend: use the `safe_user()` helper when returning user data in public endpoints.
- Token debits must be atomic (guarded `$inc` with `{"token_balance": {"$gte": amount}}`).
- Livepeer WHIP proxy needs `httpx.AsyncClient(follow_redirects=True)` — the 307 is normal.
- Pollinations image URLs: always `&nologo=true`; emotes use `&model=flux&transparent=true`.

## Environment
Windows / PowerShell — see the user-global `~/.claude/CLAUDE.md`. No local Python/Node toolchain is
reliably available, so changes here are typically verified by the deployed build, not a local run.

## 4-Agent Dev Pipeline

Run `/ship <feature request>` to launch the full pipeline:

| Agent | Model | Role | Output |
|---|---|---|---|
| `planner` | Opus | Spec from feature request | `.pipeline/spec.md` |
| `coder` | Sonnet | Implements the spec (TDD) | `.pipeline/changes.md` |
| `tester` | Sonnet | Writes + runs tests | `.pipeline/test-results.md` |
| `reviewer` | Opus | Final verdict (SHIP/NEEDS WORK/BLOCK) | `.pipeline/review.md` |

**Additional skill agents** (invokeable standalone or by the pipeline):
- `impeccable` — UI design audit and polish against Victory-AI's design language
- `task-observer` — watches pipeline failures and proposes skill improvements

**Skills baked into each agent:**
- Planner: Writing Plans + Verification Before Completion (Superpowers)
- Coder: TDD + Systematic Debugging + Anti-Pattern Czar + Verification (Superpowers + claude-mem)
- Tester: TDD (Tester perspective) + Verification (Superpowers)
- Reviewer: Code Review + Impeccable UI standards + Finishing Branch + Verification (Superpowers + Impeccable)

**Task Observer** activates automatically after any NEEDS WORK or BLOCK verdict and writes improvement proposals to `.pipeline/observations/`.

**Pipeline handoff files** (cleared at the start of each `/ship` run):
- `.pipeline/spec.md` — implementation plan from Planner
- `.pipeline/changes.md` — what was built, from Coder
- `.pipeline/test-results.md` — test output, from Tester
- `.pipeline/review.md` — verdict, from Reviewer
- `.pipeline/observations/` — improvement logs, from Task Observer
