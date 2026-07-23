# Victory AI — Record of Processing Activities (RoPA)

Legal basis: **Art. 30 GDPR**. Required fields per activity: purpose (b), categories of data
subjects/data (c), recipients (d), third-country transfers + safeguards (e), retention (f),
security measures (g).

**Controller**: [VICTORY AI LEGAL ENTITY NAME], [REGISTERED ADDRESS] — Art. 30(1)(a)
**Contact / DPO**: privacy@victoryai.co.uk — [confirm whether a DPO is legally required under
Art. 37, or whether a general privacy contact is sufficient]

Compiled from `backend/server.py` as of 2026-07-22 — review after any schema or vendor change.

---

### 1. Account registration & authentication
- **Purpose**: Create and authenticate user accounts
- **Lawful basis**: Contract (Art. 6(1)(b))
- **Data subjects**: App users
- **Data categories**: Email, name, password/OAuth identity, session tokens
- **Recipients**: Clerk, MongoDB Atlas
- **Third-country transfer**: US (Clerk) — confirm DPF/SCC status (see `dpa-register.md`)
- **Retention**: Until account deletion (cascading delete covers posts, comments, sessions,
  round videos, follows, notifications, scheduled streams, reports filed, owned streams + their
  chat, chat sent in others' streams, push subscriptions, waitlist entry)
- **Security measures**: Rate-limited login/register endpoints, secure session cookies, CORS allowlist

### 2. Profile & public fighter data
- **Purpose**: Display user profiles, fighter search, leaderboards, gym rosters
- **Lawful basis**: Contract (Art. 6(1)(b))
- **Data subjects**: App users
- **Data categories**: Display name, bio, weight class, stance, experience level, avatar, birth date (age verification only)
- **Recipients**: MongoDB Atlas; publicly visible within the app
- **Third-country transfer**: [Per DB region — see `dpa-register.md` row 7]
- **Retention**: Until account deletion or field edit
- **Security measures**: Content moderation (`is_content_flagged`) on all free-text fields before publish; profile-visibility enforcement (`_require_profile_visible`)

### 3. Payments & subscriptions
- **Purpose**: Process subscription payments, token purchases, gift subs, ad campaign payments
- **Lawful basis**: Contract (Art. 6(1)(b)); Legal obligation for tax/financial records (Art. 6(1)(c))
- **Data subjects**: Paying users, advertisers
- **Data categories**: Name, email, payment method (held by Stripe, not stored locally), transaction amounts
- **Recipients**: Stripe
- **Third-country transfer**: US — Stripe DPF/SCCs (confirm current mechanism)
- **Retention**: 7 years (typical financial record-keeping obligation — confirm against your jurisdiction's requirement); intentionally excluded from account-deletion cascade for this reason
- **Security measures**: Server-side amount calculation, atomic token balance updates, Stripe webhook signature verification, open-redirect-safe checkout origins (`_safe_checkout_origin`)

### 4. AI-generated training feedback
- **Purpose**: Generate personalised feedback after training rounds
- **Lawful basis**: Contract (Art. 6(1)(b))
- **Data subjects**: App users in training sessions
- **Data categories**: Session performance data, round metadata
- **Recipients**: OpenAI
- **Third-country transfer**: US — confirm OpenAI DPF/SCC status; confirm API data excluded from model training (org Data Controls)
- **Retention**: Life of account (this is the user's own training history — the core product record, deliberately excluded from the retention-cleanup job); deleted on account deletion
- **Security measures**: Per-user AI token quota (`check_and_consume_ai_tokens`)

### 5. Text-to-speech voice feedback
- **Purpose**: Convert AI feedback text to spoken audio
- **Lawful basis**: Contract (Art. 6(1)(b))
- **Data subjects**: App users with voice feedback enabled
- **Data categories**: Feedback text (references the user's own performance, not third-party data)
- **Recipients**: ElevenLabs
- **Third-country transfer**: [Confirm ElevenLabs hosting region/mechanism — see `dpa-register.md` row 3]
- **Retention**: Not stored server-side beyond the request (confirm ElevenLabs' own retention)
- **Security measures**: `voice_id` input validated against an allowlist pattern (fixed 2026-07-22); per-user AI quota

### 6. Live streaming & chat
- **Purpose**: Host live video streams and real-time chat between users
- **Lawful basis**: Contract (Art. 6(1)(b))
- **Data subjects**: Streamers, viewers, chat participants
- **Data categories**: Video/audio containing faces and voice, chat messages, viewer counts
- **Recipients**: Livepeer Studio, Cloudinary (thumbnails/clips)
- **Third-country transfer**: [Confirm Livepeer Studio region/mechanism — see `dpa-register.md` row 5; this integration uses the centralized Livepeer Studio product, not the raw decentralized network]
- **Retention**: Chat messages: 90 days, enforced by an automated daily cleanup job. Stream records/VOD: life of account (confirm Livepeer/Cloudinary's own VOD retention window separately)
- **Security measures**: Auth-gated chat, message length caps, content moderation, webhook signature verification

### 7. Social feed (posts, comments, likes)
- **Purpose**: User-generated content sharing and social interaction
- **Lawful basis**: Contract (Art. 6(1)(b))
- **Data subjects**: App users
- **Data categories**: Post captions, video/image content, comments, likes
- **Recipients**: MongoDB Atlas, Cloudinary
- **Third-country transfer**: [Per DB/storage region]
- **Retention**: Until deletion by user or moderation action
- **Security measures**: Content moderation on captions/comments; report-triggered auto-hide

### 8. Push notifications
- **Purpose**: Deliver stream reminders, engagement notifications
- **Lawful basis**: Consent (Art. 6(1)(a)) — confirm opt-in flow meets Art. 7
- **Data subjects**: App users who enabled push
- **Data categories**: Push subscription endpoint/keys (VAPID)
- **Recipients**: Browser push services (Google/Mozilla/Apple, per browser)
- **Third-country transfer**: [Per push service]
- **Retention**: Notifications: 180 days, enforced by an automated daily cleanup job. Push subscription record: until user disables or account deletion (confirmed — included in the account-deletion cascade)
- **Security measures**: VAPID key-based authentication

### 9. Support & feedback submissions
- **Purpose**: Handle bug reports, feature requests, general feedback
- **Lawful basis**: Legitimate interests (Art. 6(1)(f)) — product improvement
- **Data subjects**: App users submitting feedback
- **Data categories**: Name, email, free-text message, rating
- **Recipients**: Resend (email delivery to admin), MongoDB Atlas
- **Third-country transfer**: [Confirm Resend region/mechanism — see `dpa-register.md` row 4]
- **Retention**: [CONFIRM — not yet covered by the automated retention job; genuinely open]
- **Security measures**: HTML-escaped before email send (fixed 2026-07-22); admin-only read access

### 10. Waitlist / marketing signup
- **Purpose**: Pre-launch interest capture, founders promo codes
- **Lawful basis**: Consent (Art. 6(1)(a))
- **Data subjects**: Prospective users
- **Data categories**: Email, name (payload minimized 2026-07-22 — no longer forwards arbitrary extra fields)
- **Recipients**: n8n workflow (confirm operator/hosting — see `dpa-register.md` row 11), MongoDB Atlas
- **Third-country transfer**: [Confirm n8n hosting]
- **Retention**: 12 months if unconverted, enforced by an automated daily cleanup job; deleted immediately on account deletion if the same email later signs up
- **Security measures**: Rate-limited signup endpoint, minimized payload

### 11. Gyms, competitions & reports
- **Purpose**: Community group features; content/user reporting for moderation
- **Lawful basis**: Contract (Art. 6(1)(b)) for gyms/competitions; Legitimate interests (Art. 6(1)(f)) for reports
- **Data subjects**: App users
- **Data categories**: Gym name/description, competition title/description, report reason + reported content reference
- **Recipients**: MongoDB Atlas, Resend (auto-hide admin notification)
- **Third-country transfer**: [Per DB/email region]
- **Retention**: Gyms/competitions until deletion; reports: 2 years, enforced by an automated daily cleanup job
- **Security measures**: Content moderation on gym/competition free text (fixed 2026-07-22)

---

## Open items to close before this RoPA is submission-ready
- [ ] Confirm legal entity name/address/contact (Art. 30(1)(a))
- [ ] Confirm whether a DPO is required (Art. 37) or designate a privacy contact
- [ ] Fill in the two remaining `[CONFIRM]` retention periods: feedback submissions (#9), and
  cross-check every third-country transfer mechanism against `dpa-register.md`
- [ ] Cross-check against `dpa-register.md` — every "Recipient" above should have a corresponding row there

## Resolved since this RoPA was first drafted (2026-07-22)
- Auth provider corrected to Clerk — the prior `demobackend.emergentagent.com` endpoint (Activity
  #1) was dead code and has been deleted
- Retention now automatically enforced for: chat messages (90d), notifications (180d), waitlist
  (365d), moderation reports (730d), and expired auth sessions
- Waitlist payload minimized — no longer forwards arbitrary client-supplied fields
- Account-deletion cascade extended to cover chat sent in others' streams, push subscriptions,
  and the waitlist entry

> ⚠️ Informational, not legal advice. This RoPA should be reviewed by a qualified DPO/lawyer before
> being treated as your official Art. 30 record, particularly the retention periods and lawful
> basis assignments.
