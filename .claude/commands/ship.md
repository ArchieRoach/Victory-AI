Run the full feature pipeline for: $ARGUMENTS

## Step 0 — Setup

Clean up stale pipeline files from any previous run:
- Delete `.pipeline/spec.md`, `.pipeline/changes.md`, `.pipeline/test-results.md`, `.pipeline/review.md` if they exist.
- Create a new git branch named `feature/<slug-of-the-feature-request>` and check it out.

## Step 1 — Plan

Delegate to the `planner` subagent with the feature request: **$ARGUMENTS**

Wait for `.pipeline/spec.md` to exist. Read it.

**Gate:** If the spec contains any **OPEN QUESTIONS**, stop here. Show me the open questions exactly as written. Do not proceed until I answer them.

## Step 2 — Code

Delegate to the `coder` subagent.

Wait for `.pipeline/changes.md` to exist.

## Step 3 — Test

Delegate to the `tester` subagent.

Wait for `.pipeline/test-results.md` to exist. Read it.

**Gate:** If `test-results.md` contains `STATUS: FAIL` or describes broken/failing tests, stop here. Show me the failures. Do not proceed to review.

## Step 4 — UI Check (frontend features only)

If the spec or changes include any `.jsx` file modifications, delegate to the `impeccable` subagent with the instruction: "audit the changed JSX files listed in .pipeline/changes.md against the Victory-AI design language."

Append the impeccable audit result to `.pipeline/test-results.md` under a `## UI Audit` heading.

## Step 5 — Review

Delegate to the `reviewer` subagent.

Wait for `.pipeline/review.md` to exist. Read it.

## Step 6 — Report

Show me:
1. The **VERDICT** line from `.pipeline/review.md`
2. The **Merge Readiness** section
3. The list of changed files from `.pipeline/changes.md`
4. Any BLOCK or NEEDS WORK findings

## Step 7 — Observe (if verdict is not SHIP)

If the verdict is NEEDS WORK or BLOCK, delegate to the `task-observer` subagent to log what went wrong and propose improvements to the pipeline.

## Final rules

- Do **not** merge anything.
- Do **not** push anything.
- Leave the branch as-is for my morning review.
- The branch name is `feature/<slug>` on the local repo.
