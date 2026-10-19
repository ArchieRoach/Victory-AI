# App Store submission pack

Everything to paste into App Store Connect, plus the jobs only the owner can do.
Code-side readiness is tracked in the App Review Scorecard artifact.

## 1. Owner-only setup (accounts and keys)

| Done | Job | Where |
|---|---|---|
| ☐ | Apple Services ID + Sign in with Apple key, then paste into Clerk → SSO → Apple | Apple Developer → Identifiers / Keys |
| ☑ | Google OAuth web client, then paste into Clerk → SSO → Google | Google Cloud Console → Credentials |
| ☐ | APNs key: set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY`, `APNS_BUNDLE_ID` | Railway → Variables |
| ☐ | RevenueCat: App Store products + "pro" entitlement + a paywall; set the GitHub variable `REVENUECAT_IOS_API_KEY` and `REVENUECAT_SECRET_API_KEY` (Railway) | RevenueCat dashboard |
| ☑ | `REACT_APP_POSTHOG_KEY` on Vercel (analytics stay off without it) | Vercel → Environment Variables |
| ☐ | **Demo account** (section 2) | Clerk + Railway |

## 1b. Move Clerk from Development to Production (before submitting)

The live app still signs people in through Clerk's **Development** instance. Development is for
testing: it has user limits, shows a "development" banner, and uses Clerk's shared Google keys.
Real launch users need **Production**. Clerk's guide:
https://clerk.com/docs/guides/development/deployment/production

The code is ready for it:
- The server reads Clerk's signing keys from whichever instance `CLERK_SECRET_KEY` belongs to.
- Existing people keep their accounts. Production gives everyone a new Clerk ID, so on first
  sign-in the server links that ID to the old account through a **verified** email (`clerk_id`
  on the user, see `get_or_create_clerk_user`). Sessions, squads, Pro and ranks all stay.

Steps:
1. Clerk Dashboard → **Development** dropdown at the top → **Create production instance** →
   clone development settings.
2. Production needs a domain you own. Use `victoryai.co.uk` and serve the app from
   `app.victoryai.co.uk`: Vercel → Settings → Domains → add `app.victoryai.co.uk` and add the
   DNS record Vercel shows.
3. Clerk → **Domains**: add the DNS records it lists (usually 5 CNAMEs) at your domain registrar.
   If your DNS is on Cloudflare, set them to **DNS only**. Wait for them to go green (minutes, up to 48h).
4. SSO connections don't copy over. In Production, set up **Google** again with your own Google
   OAuth client (redirect URI from Clerk), and **Apple** once the Apple account is approved.
5. Swap keys, then redeploy each:
   - Vercel: `REACT_APP_CLERK_PUBLISHABLE_KEY` = `pk_live_…`
   - Railway: `CLERK_SECRET_KEY` = `sk_live_…`; add `https://app.victoryai.co.uk` to `CORS_ORIGINS`
     if that variable is set; set `FRONTEND_URL=https://app.victoryai.co.uk`.
   - GitHub variables: `CLERK_PUBLISHABLE_KEY` = `pk_live_…`, `WEB_APP_URL` = `https://app.victoryai.co.uk`.
6. Clerk → **Deploy certificates** once the home page shows nothing left to do.
7. Sign in on the new address with your own email. You should land in your existing account with
   your history and Pro.
8. Turn off **Device Trust** in Production too (section 2, step 2). Settings don't copy over.
9. Create the App Review demo user again **in Production** (section 2). Users don't copy over.

## 2. Demo account for App Review

1. In Clerk, create a user with email + password (e.g. `appreview@<your domain>`). Users made in
   the dashboard count as verified. Don't use your own login: reviewers would see your data.
2. Turn off **Device Trust**: Clerk Dashboard → **Protect** → **Protections** → **Device Trust** →
   **Manage** → switch **Enable** off → **Save**. With it on, a password sign-in from a new device
   asks for a 6-digit code emailed to the account. Reviewers are always on a new device and can't
   read the demo inbox, so they'd be stuck and the app rejected. Do this in Development and again
   in Production (the setting is per instance).
3. In Railway → Variables set `APP_REVIEW_EMAILS=appreview@<your domain>` and redeploy.
   On sign-in that account gets Pro for free (`grant_review_access` in `backend/server.py`).
4. Sign in once on a phone, finish onboarding, and do one 1-round session, so the reviewer
   sees real screens rather than empty ones. It should go straight in, with no code asked.
5. Put the email and password in App Store Connect → App Review Information → Sign-in required.

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

- Name, subtitle, keywords, promotional text, description and What's New are ready to paste in
  [`APP_STORE_LISTING.md`](APP_STORE_LISTING.md).
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

## 8. Pricing: finding the price that earns the most per user

The paywall defaults to the annual plan, and shows the weekly cost and the saving against monthly.
Prices can change without a code change: set `PRICE_MONTHLY_GBP` / `PRICE_ANNUAL_GBP` in Railway, together
with new matching Stripe prices (`STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL`) and the same prices in
App Store Connect / RevenueCat.

Don't guess the "best" price. Measure the **close rate** in PostHog: free-trial starts (`checkout_started`)
÷ people who saw the paywall (`paywall_viewed`). Wait for at least 100 paywall views, then use this rule
of thumb (Hormozi):

| Close rate | What it means | Do this |
|---|---|---|
| 80%+ | Far too cheap | Raise prices 3–4x |
| 60–80% | Too cheap | Raise 2–3x |
| 50–60% | Cheap | Raise 50–100% |
| 40–50% | A bit cheap | Raise 25–50% |
| 30–40% | About right | Keep it |
| Below 30% | The pitch needs work | Improve sign-up and the paywall before touching price |

Revenue per user = close rate × price. Change one thing at a time and give each change two weeks.

## 9. Keeping the app healthy (owner jobs)

1. **Backups:** check your database host takes automatic daily backups (MongoDB Atlas → cluster → Backup).
2. **Uptime alerts:** free UptimeRobot monitor on `https://<your Railway address>/api/health`. It returns 503
   when the database is down.
3. **Railway health check:** Railway → backend → Settings → Healthcheck Path → `/api/health`.
4. **Crash alerts (optional):** a free Sentry account; ask Claude to wire it in.
5. **Keep Railway at 1 replica** for now. The background jobs (reminders, weekly tasks) would run twice on 2.

## 10. Pro fighters and the Fighter Market (owner jobs)

1. **Turn on Stripe Connect:** Stripe Dashboard → Connect → Get started → choose **Express** accounts,
   platform country **UK**. Without it, "Set up payouts" fails and no one can sell.
2. **Verify pros:** each application emails hello@victoryai.co.uk. Check it's really them (BoxRec,
   verified Instagram DM, promoter), then approve: `POST /api/admin/pro/<user_id>/verify` with
   `{"approve": true, "fantasy_fighter_id": "<Boxing Data fighter id, optional>"}`.
3. **Approve talking clips** when the email arrives: `POST /api/admin/pro/<user_id>/clips/<moment>/approve`.
4. **Order problems** email the same inbox: `POST /api/admin/orders/<order_id>/resolve` with
   `{"action": "refund"}` or `{"action": "release"}`.
5. **Alias partners:** a fighter switches it on themselves and ticks the consent box. Agree any
   revenue share with them in writing; the dashboard shows how many fans picked them.

**App Review note to add:** "Fighter Market sells physical merch from verified boxers, paid by card
through Stripe (Guideline 3.1.5: physical goods). Paid promotions for sellers (Bump, Spotlight) are only
sold on our website and are hidden in the iOS app."
