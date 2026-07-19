# Pre-Launch Security Checklist — 2026-07-19

Prompted by a Prajwal Tomar (@PrajwalTomar_) X post: "Vibe Coders Are Getting Sued. Here's the
EXACT 30-Minute Playbook." The original article is behind X's login wall and couldn't be fetched
directly; this audit follows the equivalent 25-point checklist (same themes: exposed keys, missing
RLS/auth checks, unrate-limited endpoints, GDPR gaps) cross-referenced from the author's related
posts and a third-party writeup covering identical ground.

## 🔴 Most important finding — requires your action, not code

**`backend/.env` and `frontend/.env` were committed to git history** (commit `04a78fc`,
2026-03-02), and this repo is pushed to GitHub. Removed from current `main` and gitignored now,
but still recoverable from history by anyone with clone access. I did not read the redacted
contents — a safety classifier blocked it, correctly, since it's a sensitive action. **You should:**
1. `git show 04a78fcde4993963d75707fd0b8320384c814f0b:backend/.env` (and `frontend/.env`) yourself.
2. Rotate every credential found — Clerk, Stripe, MongoDB URI, Cloudinary, Livepeer, ElevenLabs —
   regardless of whether you think anyone's seen them.
3. Only after rotating, consider purging history (BFG Repo-Cleaner) and force-pushing — only safe
   if you're the sole clone owner.

## Fixes applied

1. **`/cloudinary/signature` had no rate limit** — unlimited signed-upload slots, matching the
   "$200 Supabase bill" cost-abuse pattern the checklist warns about. Added the standard
   `_rate_limited` guard (20/60s).
2. **Private profiles leaked via 4 endpoints** — `get_public_profile` correctly enforced the
   `is_public` flag, but `get_user_clips`, `get_user_schedule`, `get_user_followers`, and
   `get_user_following` didn't, so a private account's clips/schedule/follows were still visible to
   anyone who knew the user_id. Added a shared `_require_profile_visible()` helper, wired into all
   four.
3. **5 Stripe error handlers leaked raw exception text** to the client (`detail=str(e)`) — could
   expose internal details. All now log server-side and return a generic message.
4. **Security headers**: added `Strict-Transport-Security` to the backend's existing header
   middleware, and added a `headers` block to `frontend/vercel.json` (nosniff, frame-options,
   referrer-policy, HSTS) — the frontend had none at all before. Deliberately **did not** add a
   Content-Security-Policy — CSP needs testing against Clerk/Stripe/Livepeer/Pollinations/WebSocket
   all working, which I can't verify from here; a wrong CSP breaks things worse than no CSP.
5. **Livepeer webhook silently skipped signature verification** if `LIVEPEER_WEBHOOK_SECRET` wasn't
   set, instead of refusing to process — the same class of bug CLAUDE.md already documents being
   fixed for Stripe. Now fails closed (500) like the Stripe webhook does.
6. **No account/data deletion existed at all** — a real GDPR/CCPA gap. Added `DELETE /api/users/me`:
   removes the user's posts/comments, sessions, round videos, follows, notifications, scheduled
   streams, reports, streams + their chat history, and the account itself. Blocks if the user owns
   a gym (mirrors the existing "leave your gym first" pattern). Tips and payment_transactions are
   deliberately retained — legitimate fraud-prevention/accounting basis under GDPR.

## Checked, already correct — no change needed

- No hardcoded secrets in frontend code; no direct DB access from the browser (traditional
  client → FastAPI → MongoDB architecture, not a Supabase-style direct-query setup).
- Auth: Pydantic validates all input server-side; no raw string-built queries anywhere (no SQLi/
  NoSQLi surface); no `dangerouslySetInnerHTML` anywhere (no XSS surface); passwords hashed with
  bcrypt; CORS is an explicit origin allowlist, never `*`.
- Auth rate limiting already in place on register/login; payment amounts always come from
  server-side price tables, never client-submitted; the only 2 admin routes (`/feedback`,
  `/reports`) are both correctly gated on `ADMIN_EMAIL`.
- Session cookies already have `httponly`, `secure`, `samesite=none` set correctly.
- Stripe webhook already fails closed if its secret is missing (this was the template I matched
  the Livepeer fix to).
- `.gitignore` covers `.env` now; nothing currently tracked in the working tree.

## Not fixable from code — needs a dashboard/manual action

- **Automated backups**: MongoDB Atlas/Railway dashboard setting, not app code — confirm this is
  enabled.
- **Third-party least privilege**: Stripe/Cloudinary/Livepeer API key scopes are configured in
  each provider's dashboard, not visible from this codebase.
- **Dependency freshness**: versions in `requirements.txt` look current on inspection, but I can't
  run a live CVE scan (`pip-audit`) from here — worth adding to CI.
