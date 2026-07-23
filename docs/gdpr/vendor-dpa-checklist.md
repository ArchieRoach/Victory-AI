# Victory AI — Vendor DPA Confirmation Checklist

Legal basis: **Art. 28 GDPR** — every processor handling personal data on Victory AI's behalf
must be bound by a written contract before it processes data. Failure to have one is itself a
violation (Art. 83(4)).

Work through each vendor once. Most of this is a dashboard toggle, not a negotiation — check the
box, save the confirmation date, move on.

---

## Stripe (payments)
- [ ] Log into Stripe Dashboard → Settings → check "Data Processing Agreement" under Business/Legal settings (DPA is auto-incorporated into the Stripe Services Agreement on most accounts — confirm EU/UK addendum is active if you have EU/UK users). Self-serve download also available directly at stripe.com/legal/dpa
- [ ] Confirm transfer mechanism: EU-US DPF or 2021 SCCs
- [ ] Download/screenshot confirmation → file in DPA register

## OpenAI (AI round feedback)
- [ ] Log into platform.openai.com → org Settings → **Data Controls**
- [ ] Confirm API data is excluded from model training (should be default for API usage, not ChatGPT usage — verify it wasn't changed)
- [ ] Locate OpenAI's DPA (openai.com/policies) and confirm it applies to your org
- [ ] Note transfer mechanism (DPF/SCCs)

## ElevenLabs (text-to-speech)
- [ ] Check account plan — DPA may be gated behind a paid/Business tier on some providers
- [ ] If not visible in dashboard, email support/legal requesting the standard DPA
- [ ] Confirm what happens to submitted text (training use, retention) — TTS input can contain arbitrary user text

## Resend (transactional email)
- [ ] Their DPA auto-binds when you accept Resend's Terms of Service — the executed copy is retrievable from your Resend dashboard, no separate acceptance step needed
- [ ] Retrieve and file it

## Livepeer Studio (live streaming/transcoding)
- [ ] Confirmed via code: this app uses **Livepeer Studio** (`livepeer.studio/api`), the centralized
  hosted product — not the raw decentralized network. A normal Art. 28 contract applies, no
  specialist legal review needed on that specific question.
- [ ] Their published `/dpa` path 404'd when checked — contact Livepeer Studio support for the current DPA link
- [ ] Confirm via dashboard once located

## Cloudinary (video/image storage)
- [ ] Dashboard → Account → Data Processing Agreement (no working self-serve link found on check — may require locating via account/billing section or contacting support)
- [ ] Confirm storage region / transfer mechanism

## MongoDB Atlas (primary database)
- [ ] Bundled automatically into the Cloud Services Agreement at signup — no separate self-serve step needed unless you require a standalone executed copy (contact MongoDB support for that)
- [ ] Confirm cluster's data region (controls Art. 44–49 transfer exposure directly)

## Clerk (authentication)
- [ ] No self-serve DPA page found — email **privacy@clerk.dev** to request/execute
- [ ] This is one of your most sensitive processor relationships (holds login identity) — prioritize this one

## Vercel (frontend hosting)
- [ ] Dashboard → Settings → Legal — DPA usually auto-incorporated; confirm

## Railway (backend hosting)
- [ ] Confirmed as production host (runs `backend/server.py`) — no longer an open question
- [ ] Dashboard → Settings/Legal — locate and confirm their DPA

## ~~"Emergent" OAuth / auth provider~~ — resolved, no longer applicable
`backend/server.py` used to point auth at `demobackend.emergentagent.com`. Confirmed this was
dead code — the only frontend route that called it (`AuthCallback.jsx`) was never wired into the
app's router, while the backend endpoint remained live and public (an auth-bypass surface, not
just an undisclosed processor). Both were deleted 2026-07-22. Clerk is the real, current auth
provider — tracked under its own row above.

## n8n webhook operator (waitlist forwarding)
- [ ] Confirm who hosts/operates the n8n instance receiving the waitlist webhook
- [ ] The payload was minimized 2026-07-22 (previously forwarded arbitrary extra client fields —
  now only email/name/promo_code), which reduces exposure but doesn't remove the need for a DPA
  with whoever operates that instance

---

## After each vendor
1. Save the DPA confirmation (PDF/screenshot) with a date.
2. Add a row to `dpa-register.md`.
3. Add/confirm the corresponding processing activity in `ropa.md`.

## Time estimate
~1–3 hours total across all vendors above — the mechanical part is fast. Locating Cloudinary's
and Livepeer Studio's current DPA links, and getting a response from Clerk, are the parts most
likely to take longer than a single sitting.

> ⚠️ Informational, not legal advice. Get a qualified data protection lawyer or DPO to review
> before relying on this checklist as complete, especially for OpenAI given the EDPB
> Opinion 28/2024 guidance on AI model training data.
