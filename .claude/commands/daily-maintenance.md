# /daily-maintenance

Run the daily 3-part maintenance pass on Victory AI. Use this when you want full live oversight
inside Claude Code rather than waiting for the GitHub Actions run.

Complete ALL three tasks, then write a log and offer to commit.

────────────────────────────────────────────
TASK 1 — THREE UI MICRO-IMPROVEMENTS
────────────────────────────────────────────
Pick 3 small, safe, high-impact UI edits across frontend/src/pages/*.jsx or
frontend/src/components/*.jsx. Focus areas (pick whichever needs it most):
- Empty states: add icon + heading + helpful subtext if any page just shows muted text
- Touch targets: any button/icon < 44px should get w-11 h-11 + touch-target class
- Accessibility: missing aria-label on icon-only buttons
- Loading states: shimmer skeletons where a page still has no loading treatment
- Colour consistency: use victory-lime/victory-teal instead of raw Tailwind colours
- Typography: section titles should use .section-label, not ad-hoc className combos

Design tokens: victory-lime=#E8FF47, victory-teal=#47E8C8, victory-bg=#0A0A0F,
victory-card=#12121A, victory-card-highlight=#1A1A26, victory-border=#2A2A3A,
victory-muted=#8888A0, victory-text=#F0F0F5
CSS classes: .victory-btn-primary .victory-btn-secondary .victory-btn-ghost
  .victory-input .victory-label .victory-card .stat-pill .section-label
  .filter-pill .skeleton-shimmer .touch-target
Fonts: font-heading=Space Grotesk, font-body=Inter, font-mono=JetBrains Mono
Auth: all pages use { API, useAuth } from "@/App" — do not change auth logic.

────────────────────────────────────────────
TASK 2 — SECURITY AUDIT
────────────────────────────────────────────
Read backend/server.py and check for:
- Endpoints missing auth (not behind get_current_user dependency)
- Missing or weak rate limiting (use _rate_limited(key, max_calls, window))
- Hardcoded secrets or tokens (should use os.environ.get)
- Unvalidated user input going into MongoDB queries
- Missing CORS restrictions or overly permissive allow_origins
Fix any critical issues you find. Patch minor ones directly; note major ones in the log.

────────────────────────────────────────────
TASK 3 — DEBUG SWEEP
────────────────────────────────────────────
In frontend/src, search for:
- console.error / console.warn that swallow errors silently (no user feedback)
- Unhandled promise rejections (catch blocks that only log, not toast)
- TODO or FIXME comments left in source
Fix small issues in-place. For anything larger, note it in the log.

────────────────────────────────────────────
WRAP UP
────────────────────────────────────────────
After completing the tasks:
1. Write a concise log to .claude/maintenance-logs/YYYY-MM-DD.md (today's actual date)
2. Show a summary of every change made
3. Ask: "Ready to commit and push to a maintenance branch?"
