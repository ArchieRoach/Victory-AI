# Victory AI — iOS Setup

The Xcode project is **generated**, not committed: `project.yml` is an
[XcodeGen](https://github.com/yonaskolb/XcodeGen) spec, and `.github/workflows/ios.yml` builds it on
GitHub's macOS 26 / Xcode 26 runners. No local Mac or Xcode is needed to ship.

| What | Where it lives |
|---|---|
| Swift package (Clerk) | `project.yml` → `packages` (`ClerkKit`, clerk-ios 1.5.7+) |
| Info.plist keys, purpose strings, background modes | `project.yml` → `info.properties` |
| Entitlements (Push, Sign in with Apple) | `project.yml` → `entitlements` |
| Privacy manifest | `VictoryAI/PrivacyInfo.xcprivacy`, copied as a resource by `project.yml` |
| App icon, logo, Google "G" | `VictoryAI/Resources/Assets.xcassets` (icon is a crop of the belt logo — replace any time) |
| `@main` + Clerk configure + APNs delegate | `VictoryAI/App/VictoryAIApp.swift` |

## Building in the cloud (GitHub Actions)

- **Every push touching `ios/`** runs the `compile` job: an unsigned simulator build. It needs no
  secrets — use it to confirm the Swift compiles.
- **TestFlight upload**: GitHub → Actions → **iOS** → **Run workflow**. Signs with the distribution
  certificate + App Store profile below and uploads; the build appears in App Store Connect →
  TestFlight after 10–30 min of processing. The build number is the workflow run number.

### One-time signing setup (no Xcode needed)

1. **Distribution certificate** — on any Mac/Linux terminal:
   ```bash
   openssl genrsa -out dist.key 2048
   openssl req -new -key dist.key -out dist.csr -subj "/CN=Victory AI Distribution/C=GB"
   ```
   Apple Developer → Certificates → **+** → **Apple Distribution** → upload `dist.csr` →
   download `distribution.cer`, then:
   ```bash
   openssl x509 -in distribution.cer -inform DER -out dist.pem
   openssl pkcs12 -export -inkey dist.key -in dist.pem -out dist.p12 -passout pass:CHOOSE_A_PASSWORD
   base64 -i dist.p12 | pbcopy        # → secret DIST_CERT_P12_BASE64
   ```
   Keep `dist.key` / `dist.p12` somewhere safe and out of the repo.
2. **App ID** — Apple Developer → Identifiers → your bundle ID with **Push Notifications** and
   **Sign in with Apple** enabled. (Enable these *before* step 3 — profiles snapshot capabilities.)
3. **App Store profile** — Profiles → **+** → **App Store Connect** → pick the App ID and the
   certificate from step 1 → name it (e.g. `VictoryAI App Store`) → download, then
   `base64 -i VictoryAI_App_Store.mobileprovision | pbcopy` → secret `PROFILE_BASE64`.
4. **App Store Connect API key** — App Store Connect → Users and Access → Integrations →
   App Store Connect API → Team Keys → **+** (role **App Manager**) → download the `.p8`
   (once only), note the Key ID and Issuer ID.
5. **App record** — App Store Connect → My Apps → **+** → New App with the same bundle ID
   (uploads fail until this exists).

### GitHub repository settings → Secrets and variables → Actions

| Kind | Name | Value |
|---|---|---|
| Variable | `IOS_BUNDLE_ID` | Bundle ID, e.g. `com.yourname.victoryai` |
| Variable | `APPLE_TEAM_ID` | 10-character Team ID (Apple Developer → Membership) |
| Variable | `IOS_PROFILE_NAME` | Exact profile name from step 3 |
| Variable | `CLERK_PUBLISHABLE_KEY` | `pk_live_…` — same Clerk instance as the web app |
| Variable | `BACKEND_URL` | Railway URL, no trailing slash |
| Variable | `WEB_APP_URL` | Optional; defaults to `https://victory-ai-alpha.vercel.app` |
| Secret | `DIST_CERT_P12_BASE64` | From step 1 |
| Secret | `DIST_CERT_PASSWORD` | The password chosen in step 1 |
| Secret | `PROFILE_BASE64` | From step 3 |
| Secret | `ASC_KEY_P8` | Full contents of the API key `.p8` from step 4 |
| Secret | `ASC_KEY_ID` | Its Key ID |
| Secret | `ASC_ISSUER_ID` | Issuer ID shown above the keys list |

The profile and certificate expire yearly — regenerate and update the two secrets when they do.

### Building locally (if you ever have a Mac with Xcode 26)

```bash
brew install xcodegen
cd ios
IOS_BUNDLE_ID=com.yourname.victoryai APPLE_TEAM_ID=XXXXXXXXXX BUILD_NUMBER=1 \
  CLERK_PUBLISHABLE_KEY=pk_live_... BACKEND_URL=https://... WEB_APP_URL=https://victory-ai-alpha.vercel.app \
  IOS_PROFILE_NAME="VictoryAI App Store" xcodegen generate
open VictoryAI.xcodeproj
```

## Purpose strings and privacy

The camera / microphone / photo-library purpose strings in `project.yml` are required — the upload
is rejected if a framework touches one of these and the string is missing. Notifications need no
Info.plist string; the system prompt appears the first time a signed-in user with access reaches the
app. Contacts are **not** accessed on iOS — the "find friends from contacts" feature relies on the
browser Contact Picker API, which WKWebView does not expose. Do not add `NSContactsUsageDescription`
unless that changes.

The privacy manifest declares: email, name, user ID, purchase history, photos/videos, audio, other
user content, product interaction, crash data — all "linked to identity", none used for tracking.
The App Privacy answers in App Store Connect must match it (plus PostHog under analytics). Clerk's
SDK ships its own manifest. Update ours if data collection changes.

## Navigation flow

```
App launch (existing session) → SplashView → validate → .app / .paywall / .lapsed / .networkError
App launch (no session)       → SignInView
Sign in complete              → validate  → .app / .paywall / .lapsed / .networkError
Network unreachable           → NetworkErrorView (retry button, never locks user out)
.paywall / .lapsed           → Restore Access → re-validate (no purchase or portal link — Guideline 3.1.1)
.app                          → PushNotificationManager.enable() → APNs token POSTed to /api/push/apns
Any screen → Sign Out         → DELETE /api/push/apns → Clerk.shared.auth.signOut() → SignInView
```

## Social login (Apple + Google)

`SignInView.swift` uses ClerkKit (`Clerk.shared.auth`):

- **Email + password** — `signInWithPassword`. This is what App Review uses with the demo account,
  so keep password sign-in enabled in Clerk.
- **Sign in with Apple** — `signInWithApple()`, the native `ASAuthorization` sheet (ID-token flow,
  no web redirect).
- **Continue with Google** — `signInWithOAuth(provider: .google)`, via
  `ASWebAuthenticationSession` (not an embedded webview, so Google's `disallowed_useragent` block
  does not apply). Redirects back to `<bundle id>://callback`.

**App Store rule:** because we offer Google, Sign in with Apple is **mandatory** (Guideline 4.8)
and must be at least as prominent — hence Apple is listed first and full-width. Do not remove it.

Setup steps (all one-time):

1. **Apple Developer** → Identifiers → your App ID → enable **Sign in with Apple** (the entitlement
   is already in `project.yml`). For the **web** app's Apple button, also create a **Services ID**
   and a **Sign in with Apple key (.p8)**.
2. **Google Cloud Console** → APIs & Services → Credentials → create an **OAuth 2.0 Web client**
   (Clerk uses the web client, even for the native SDK). Configure the OAuth consent screen (app
   name, logo, support email, privacy-policy + terms URLs).
3. **Clerk Dashboard** → **SSO Connections** → enable **Apple** (Services ID, key ID, team ID, .p8)
   and **Google** (client ID + secret) on the same instance the web app uses.
4. **Clerk Dashboard** → **Native applications** → add the iOS app (Team ID + bundle ID) — native
   Sign in with Apple verifies the ID token against it — and allowlist the redirect URL
   `<bundle id>://callback` for Google.

## Image assets

`VictoryAI/Resources/Assets.xcassets` holds `AppIcon` (1024², no alpha — a crop of the belt logo,
swap for a purpose-made icon any time), `victory-logo`, and `ic_google` (vector Google "G"). The
Apple button uses the `apple.logo` SF Symbol.

## MainAppView

Implemented as a `WKWebView` wrapper around the deployed web app (`App/MainAppView.swift`) rather
than a native rebuild — the web app already has every screen. It bridges the native Clerk session
into the page via `window.__setMobileAuthToken`, which `frontend/src/App.js`'s `AuthProvider`
accepts as a Bearer token source alongside (and preferred over) the web Clerk SDK. Token is
re-pushed every 45s since Clerk session JWTs are short-lived.

It also adds `VictoryAI-iOS` to the user agent. `frontend/src/lib/nativeShell.js` detects that and
hides every Stripe purchase surface (paywall, token store, gift subs, advertising, upgrade prompts)
inside the app, as Guideline 3.1.1 requires. Subscriptions bought on the web still unlock the app
under the 3.1.3(b) multiplatform-services exception.

## Push notifications (APNs)

The backend sends every notification to both web push and APNs (`_send_apns` in
`backend/server.py`). One-time setup:

The capability, background mode and `@UIApplicationDelegateAdaptor` are already wired
(`project.yml`, `VictoryAIApp.swift`). One-time setup:

1. **Apple Developer** → Identifiers → your App ID → enable **Push Notifications** (before
   creating the App Store profile).
2. **Apple Developer** → Keys → **+** → enable **Apple Push Notifications service (APNs)** →
   download `AuthKey_XXXXXXXXXX.p8` (it can only be downloaded once). One key can have both APNs
   and Sign in with Apple enabled.
3. Set the four `APNS_*` Railway variables below. Until all four exist, iOS push silently no-ops.

Debug builds register **sandbox** tokens; TestFlight / App Store builds register **production**
tokens. The backend sends each token to the matching APNs host. Tapping a notification opens its
`url` path inside the web view.

## Environment variables on Railway (already set — confirm they exist)

| Variable | Purpose |
|---|---|
| `CLERK_SECRET_KEY` | Validate Clerk JWTs + fetch user details |
| `STRIPE_API_KEY` | Live-verify subscriptions |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures |
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | Database name (default: `victoryai`) |
| `APNS_KEY_ID` | 10-character key ID of the APNs .p8 key |
| `APNS_TEAM_ID` | Apple Developer team ID |
| `APNS_KEY` | Full contents of the .p8 file (literal `\n` for newlines is fine) |
| `APNS_BUNDLE_ID` | The app's bundle ID (the APNs topic) |

## MongoDB — one-time backfill

Run this once in MongoDB Atlas / Compass to add `access_granted` to existing users:

```js
db.users.updateMany(
  { access_granted: { $exists: false } },
  { $set: { access_granted: true } }
)
```
