# Victory AI — Data Processing Agreement (DPA) Register

Legal basis: **Art. 28(3)** — tracks the contract required with every processor. Update the
**Status** and **Confirmed** columns as each item in `vendor-dpa-checklist.md` is closed out.
Each row should cite back to a processing activity in `ropa.md`.

| # | Processor | Service | Data categories | RoPA ref | Transfer mechanism | Status | Confirmed date | Review by | Notes |
|---|-----------|---------|-----------------|----------|--------------------|--------| ------|-----------|-------|
| 1 | Stripe | Payments, subscriptions, tokens, ad checkout | Name, email, payment method, transaction data | #3 | US — DPF / SCC [confirm] | ☐ Not started | | | Auto-incorporated DPA on most accounts — verify EU/UK addendum active |
| 2 | OpenAI | AI round-feedback generation | Session/performance text | #4 | US — DPF / SCC [confirm] | ☐ Not started | | | Confirm API data excluded from model training in org Data Controls |
| 3 | ElevenLabs | Text-to-speech | Feedback text submitted for synthesis | #5 | [confirm] | ☐ Not started | | | DPA may require Business/Enterprise tier or a support request |
| 4 | Resend | Transactional email (feedback notifications, etc.) | Name, email, message content | #9 | [confirm] | ☐ Not started | | | |
| 5 | Livepeer Studio | Live video streaming/transcoding | Video/audio (faces, voice) | #6 | [confirm] | ☐ Not started | | | Confirmed: this integration uses Livepeer Studio's hosted API (`LIVEPEER_BASE_URL = livepeer.studio/api`), the centralized SaaS product — not the raw decentralized network. A normal Art. 28 contract applies; their `/dpa` page 404'd on check, contact support for the current link |
| 6 | Cloudinary | Video/image storage (thumbnails, clips) | Video/image content | #6, #7 | [confirm] | ☐ Not started | | | |
| 7 | MongoDB Atlas | Primary database | All categories — full personal data at rest | All | [confirm cluster region] | ☐ Not started | | | Standard DPA part of Atlas Customer Agreement |
| 8 | Vercel | Frontend hosting | Request/IP logs | All (transit) | [confirm] | ☐ Not started | | | |
| 9 | Railway | Backend hosting (`backend/server.py`) | Request/IP logs, DB access | All (transit) | [confirm] | ☐ Not started | | | Confirmed production host per project config — no longer an open question |
| ~~10~~ | ~~Emergent (`demobackend.emergentagent.com`)~~ | ~~Auth/identity/OAuth~~ | — | — | — | ✅ N/A — removed | 2026-07-22 | | Was dead code (no frontend route reached it) and a live auth-bypass surface. Endpoint and its only caller (`AuthCallback.jsx`) deleted outright rather than DPA'd — see RoPA Activity #1, now Clerk |
| 11 | n8n webhook operator | Waitlist signup forwarding | Email, name | #10 | [confirm] | ☐ Not started | | | Confirm who hosts/operates the n8n instance receiving this webhook. Payload minimized 2026-07-22 (was forwarding arbitrary extra fields — no longer does) |

**Status legend**: ☐ Not started · ◐ Requested/pending · ✅ Confirmed · ⚠️ Needs legal review

---

## How to close each row
1. Work the corresponding item in `vendor-dpa-checklist.md`.
2. Set **Status**, fill **Confirmed date**, and set **Review by** to +12 months (or the vendor's
   own DPA renewal cadence if shorter).
3. Attach the accepted DPA/screenshot to your evidence folder — this register is the index, not
   the storage location.
4. Re-open a row if the vendor changes its subprocessors, hosting region, or terms — Art. 28(2)
   requires your awareness of subprocessor changes.

## Rows needing resolution before "Confirmed" is even the right target
- **#5 Livepeer Studio** — now clarified in code, but the vendor's own current DPA link still
  needs locating (their published `/dpa` path returned 404 on check) — contact their support.

> ⚠️ Informational, not legal advice. Treat "Confirmed" status as a tracking convenience, not proof
> of compliance — a qualified DPO/lawyer should review the underlying agreements, especially any
> cross-border transfer mechanism relying on the EU-US DPF (which remains under CJEU appeal,
> Case C-703/25 P).
