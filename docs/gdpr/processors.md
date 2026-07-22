# Third-Party Processors (GDPR Art. 28)

Tracks every processor with access to Victory AI user personal data, plus exactly how to get
each DPA in place. Checked 2026-07-22 against each vendor's current legal/trust page.

## ⚠️ Fix first: undisclosed processor found in code

`backend/server.py:552` (`POST /auth/session`) forwards a client-supplied `session_id` to
`https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data` and uses whatever it
returns (email, name, picture, session_token) to create/update a user account and issue a
real session cookie.

- The frontend route that used to call this (`AuthCallback.jsx`) is **not wired into
  `App.js`** — no current UI reaches it. But the backend endpoint is still live and public.
- "demobackend" reads as a leftover from an early prototyping platform, not a real vendor
  relationship — worth confirming, then either **removing the endpoint** (Clerk now handles
  auth) or, if it's genuinely still needed, adding Emergent as a proper Art. 28 processor
  with a DPA.
- Until resolved this is both an undisclosed third-party data flow (Art. 13(1)(e), 28) and a
  live auth-bypass surface: anyone can `POST` an arbitrary `session_id` to this endpoint.
- **Recommendation: delete the dead route** rather than sort a DPA for it — it's not part of
  the current auth flow. Flag if you want that change made.

## Processor tracker

| Processor | Purpose | Data shared | Region | DPA path | Status |
|---|---|---|---|---|---|
| Stripe | Payments | Payment tokens, billing email | US | Self-serve: [stripe.com/legal/dpa](https://stripe.com/legal/dpa) — "Click here to download the DPA," no approval needed | [ ] Download & file |
| Resend | Transactional email | Email, name | US | Auto-binding when you accepted Resend's Terms of Service; the executed copy is in your Resend dashboard | [ ] Retrieve from dashboard & file |
| OpenAI | AI feedback, content moderation | Session data, user-generated text | US | Self-serve toggle in the platform dashboard: **platform.openai.com → Organization → Data controls** (their DPA page blocked automated fetch, verify manually) | [ ] Enable & file |
| MongoDB Atlas | Primary database | All personal data at rest | Confirm cluster region in Atlas console | Bundled into the Cloud Services Agreement automatically at signup; contact MongoDB support only if you need a separately *executed* copy | [ ] Confirm cluster region; file bundled DPA |
| Clerk | Authentication | Email, name, auth identifiers | US | No self-serve page found — email **privacy@clerk.dev** to request/execute | [ ] Email & file |
| Cloudinary | Media storage (video/image) | Uploaded videos, images | US | No working self-serve link found — check your Cloudinary account's legal/billing section or contact support | [ ] Locate & file |
| ElevenLabs | Text-to-speech AI feedback | Feedback text (no direct identifiers) | US | Self-serve tier: accepted implicitly via sign-up terms; if this account is upgraded past self-serve, request a signed copy from their sales/support | [ ] Confirm tier & file |
| Livepeer Studio | Live-stream transcoding | Stream video | US | This integration uses **Livepeer Studio** (`livepeer.studio`), the centralized SaaS company — not the raw decentralized network, so a normal Art. 28 contract applies. Their `/dpa` path 404'd on check — contact their support for the current link | [ ] Locate & file |

## Action items
- [ ] Resolve the `demobackend.emergentagent.com` finding above before anything else — either
  remove the dead endpoint or formally add it as a processor.
- [ ] Confirm MongoDB Atlas cluster region — if it's in the EU/UK, no transfer mechanism
  needed for that hop.
- [ ] For any vendor without a self-serve DPA, use the request template below.
- [ ] Re-check this list whenever a new processor is added to the stack.

## Request template (for Clerk, Cloudinary, and any vendor without self-serve)

> Subject: Data Processing Agreement request — [Victory AI account email/org name]
>
> Hi, we're a customer of [Vendor] (account: [email/org ID]) and need a Data Processing
> Agreement in place to cover our GDPR/UK GDPR Art. 28 obligations. Could you send your
> standard DPA for us to review and execute, or point us to your self-serve acceptance flow
> if one exists? Thanks.

If a vendor has no standard DPA of their own, use `dpa-template.md` in the gdpr-compliance
skill (`~/.claude/skills/gdpr-compliance/references/dpa-template.md`) as the controller-side
template to send them instead.

> Not legal advice — a qualified DPO or lawyer should sign off on the final set of DPAs,
> especially for OpenAI given the EDPB Opinion 28/2024 guidance on AI model training data.
