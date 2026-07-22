# Record of Processing Activities (GDPR Art. 30)

Controller: Victory AI. Contact: privacy@victoryai.co.uk.

| Activity | Purpose | Data subjects | Data categories | Recipients | Lawful basis | Retention | Security measures |
|---|---|---|---|---|---|---|---|
| Account management | Auth, profile | App users | Email, name, auth ID | Clerk | Contract Art. 6(1)(b) | Life of account | Secure cookies, rate limiting |
| Training sessions & AI feedback | Core product | App users | Session/round videos, AI scores | Cloudinary, OpenAI, ElevenLabs | Contract Art. 6(1)(b) | Life of account | Signed uploads, access control |
| Payments & subscriptions | Billing | Paying users | Payment tokens, billing email | Stripe | Contract Art. 6(1)(b) | Per Stripe/accounting requirements | Webhook signature verification |
| Social features (posts, comments, follows) | Core product | App users | UGC, social graph | Cloudinary (media), OpenAI (moderation) | Contract Art. 6(1)(b) | Life of account | Content moderation, report/hide system |
| Live streaming & chat | Core product | Streamers, viewers | Stream video, chat messages | Livepeer | Contract Art. 6(1)(b) | Chat: 90 days; streams: life of account | Moderation, rate limiting |
| Push notifications | Engagement | Opted-in users | Device push token | — | Consent Art. 6(1)(a) | Life of subscription; revocable | User-controlled opt-out |
| Waitlist signups | Pre-launch lead capture | Prospective users | Email, name | n8n workflow (Hostinger-hosted) | Consent/contract precursor Art. 6(1)(b) | 12 months if unconverted | Rate limited, minimized payload |
| Moderation reports | Trust & safety | Reporters, reported users | Report reason, content reference | — | Legitimate interest Art. 6(1)(f) | 2 years | Access-restricted |
| Feedback submissions | Product improvement | App users | Feedback text, rating | Resend (email delivery) | Legitimate interest Art. 6(1)(f) | Life of account | HTML-escaped, internal only |

## International transfers
Most recipients above (Clerk, Stripe, Cloudinary, Livepeer, ElevenLabs, OpenAI, Resend) are
US-based. See [processors.md](./processors.md) for per-vendor DPA/transfer-mechanism status.

## Review cadence
Review this RoPA whenever a new data flow, feature, or third-party processor is added —
at minimum, revisit alongside each major feature launch.

> Generated as part of a GDPR compliance audit. Not a substitute for legal sign-off — see
> the disclaimer in [processors.md](./processors.md).
