# Victory AI

Full-stack boxing-training + live-streaming app. See `HANDOFF.md` for current branch/status.

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
