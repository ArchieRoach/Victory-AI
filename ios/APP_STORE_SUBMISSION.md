# App Store submission pack

Everything to paste into App Store Connect, plus the jobs only the owner can do.
Code-side readiness is tracked in the App Review Scorecard artifact.

## 1. Owner-only setup (accounts and keys)

| Done | Job | Where |
|---|---|---|
| ☐ | Apple Services ID + Sign in with Apple key, then paste into Clerk → SSO → Apple | Apple Developer → Identifiers / Keys |
| ☐ | Google OAuth web client, then paste into Clerk → SSO → Google | Google Cloud Console → Credentials |
| ☐ | APNs key: set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY`, `APNS_BUNDLE_ID` | Railway → Variables |
| ☐ | RevenueCat: App Store products + "pro" entitlement + a paywall; set `REVENUECAT_API_KEY` (iOS) and `REVENUECAT_SECRET_API_KEY` (Railway) | RevenueCat dashboard |
| ☐ | `REACT_APP_POSTHOG_KEY` on Vercel (analytics stay off without it) | Vercel → Environment Variables |
| ☐ | **Demo account** (section 2) | Clerk + Railway |

## 2. Demo account for App Review

1. In Clerk, create a user with email + password (e.g. `appreview@<your domain>`). Verify the email.
2. In Railway → Variables set `APP_REVIEW_EMAILS=appreview@<your domain>` and redeploy.
   On sign-in that account gets Pro for free (`grant_review_access` in `backend/server.py`).
3. Sign in once on a phone, finish onboarding, and do one 1-round session, so the reviewer
   sees real screens rather than empty ones.
4. Put the email and password in App Store Connect → App Review Information → Sign-in required.

## 3. App Review notes (paste as-is, fill the blanks)

> Victory AI is a boxing training partner. Sign in with the demo account above (email + password
> on the first screen). It already has Pro.
>
> Try it: Train → Start Training. Allow the camera: Live Coach counts punches on the phone
> (nothing is uploaded) and the coach calls combos aloud. After the round you get your results.
>
> Purchases: Pro is sold only through App Store in-app purchase (RevenueCat). Tokens, gifts and
> cosmetics can't be bought in the iOS app; those screens say "Not available in the app".
> Subscriptions bought on our website unlock through Restore Purchases (Guideline 3.1.3(b)).
>
> Native features: Sign in with Apple, push notifications, a Live Activity on the Lock Screen and
> Dynamic Island during rounds, Siri Shortcuts ("Start a round"), AirPods head-motion tracking, haptics, and Liquid
> Glass sign-in on iOS 26.
>
> User content: posts, chat and live streams are filtered by automatic moderation. Every post,
> comment and profile has Report and Block, and reports are acted on within 24 hours (Terms §
> Acceptable use). Accounts can be deleted in Profile → Delete Account.
>
> Corner Surprises are free rewards earned by training. They can't be bought and the odds are
> shown in the app.

## 4. Age rating questionnaire

Answer honestly. These answers match how the app works today:

- Unrestricted web access: **No** (outside links open in an in-app Safari sheet).
- User-generated content, messaging or chat: **Yes** (posts, comments, live chat). Moderated, with report and block.
- Live streaming: **Yes**.
- Contests: **Yes** (seasons, Golden Gloves, competitions; no paid entry, no cash prizes).
- Gambling / simulated gambling: **No**. Fantasy uses free points only, never money.
- Loot boxes / paid random items: **No**. Corner Surprises are free, never sold, odds shown.
- Realistic violence: **Infrequent/Mild** (boxing training videos).
- Expected result: **13+ or higher**. Apple may set it higher because of live streaming. Accept what the questionnaire gives you.

## 5. App Privacy ("nutrition label")

Must match `ios/VictoryAI/PrivacyInfo.xcprivacy`. Tracking: **No**. No data is used to track you.

| Data type | Linked to you | Purpose |
|---|---|---|
| Name, Email address, User ID | Yes | App functionality |
| Photos or videos (round videos, posts) | Yes | App functionality |
| Audio (live streams only) | Yes | App functionality |
| Other user content (posts, comments) | Yes | App functionality |
| Purchase history | Yes | App functionality |
| Product interaction (PostHog) | Yes | Analytics, app functionality |
| Crash data | No | App functionality, analytics |

## 6. Store listing

- Description must include links to **Terms** (`https://victory-ai-alpha.vercel.app/terms`) and
  **Privacy** (`https://victory-ai-alpha.vercel.app/privacy`), required for auto-renewing subscriptions.
- Screenshots: 6.9" and 6.5" iPhone (portrait). Suggested set: Home, a round with a combo call,
  results with scouting report, Hours ladder / ranks, partner card, Season Wrapped.
- Optional preview video: 15–30 seconds of one round.
- Build: CI already archives on `macos-26` (Xcode 26 / iOS 26 SDK), which new submissions need.

## 7. Final manual pass before submitting

1. Fresh install → Sign in with Apple → onboarding → one round → results.
2. Buy Pro in the sandbox → Pro unlocks → Billing → Customer Center → cancel.
3. Restore Purchases on a second device.
4. Airplane mode → the app shows "No Connection" with Retry (not a blank screen).
5. Tap an outside link (a legend's YouTube tip) → it opens in a Safari sheet.
6. Delete account → you're signed out and can't sign back in to the old data.
