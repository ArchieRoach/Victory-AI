# Victory AI — iOS Setup

## Dependencies (Swift Package Manager)

Add these in Xcode → File → Add Package Dependencies:

| Package | URL | Version |
|---|---|---|
| ClerkSDK | `https://github.com/clerk/clerk-ios` | Up to next major (`0.x`) |

## Info.plist keys required

```xml
<!-- Railway backend URL (no trailing slash) -->
<key>BACKEND_URL</key>
<string>https://YOUR_RAILWAY_BACKEND_URL</string>

<!-- Clerk publishable key -->
<key>CLERK_PUBLISHABLE_KEY</key>
<string>pk_live_XXXX</string>

<!-- Web app URL — MainAppView loads this in a WKWebView post-paywall -->
<key>WEB_APP_URL</key>
<string>https://victory-ai-alpha.vercel.app</string>

<!-- No SUBSCRIBE_URL / STRIPE_PORTAL_URL: the native app must not link to Stripe
     (Guideline 3.1.1). Delete those keys if an older Info.plist still has them. -->

<!-- Clerk OAuth callback scheme (must match your app's bundle ID) -->
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    </array>
  </dict>
</array>

<!-- Purpose strings — REQUIRED. The app is rejected on upload if a framework
     touches one of these and the string is missing. Camera + microphone are
     used to record training sessions; photo library to pick an existing clip;
     notifications for reminders. -->
<key>NSCameraUsageDescription</key>
<string>Victory AI uses the camera to record your boxing sessions so the AI can score your technique.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Your session videos include audio so the AI can analyse rhythm and breathing.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Choose an existing training video to analyse instead of recording a new one.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Save your scorecard image to your photo library.</string>

<!-- Remote notifications (APNs) — see "Push notifications" below -->
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
</array>
```

Notifications use `UNUserNotificationCenter` (no Info.plist string needed). The system
prompt appears the first time a signed-in user with access reaches the app. Contacts are **not**
accessed on iOS — the "find friends from contacts" feature relies on the browser
Contact Picker API, which WKWebView does not expose, so it never runs here. Do not
add `NSContactsUsageDescription` unless that changes.

## Privacy manifest

`VictoryAI/PrivacyInfo.xcprivacy` is committed. Add it to the app target's **Copy
Bundle Resources** build phase so it ships in the `.app`. Before every submission:

- Product → Archive → right-click the archive → **Generate Privacy Report**, and
  reconcile it against the App Privacy answers in App Store Connect — they must match.
- Each linked SDK should bring its own `.xcprivacy`; the Clerk iOS SDK does. If the
  privacy report flags a "required reason" API we don't declare, add it to the
  manifest's `NSPrivacyAccessedAPITypes`.
- The manifest currently declares: email, name, user ID, purchase history,
  photos/videos, audio, other user content, product interaction, crash data — all
  "linked to identity", none used for tracking. Update it if data collection changes
  (e.g. adding StoreKit IAP, device location, or PostHog session replay).

## App entry point

Replace your default `ContentView` with `AppRootView`:

```swift
import SwiftUI
import ClerkSDK

@main
struct VictoryAIApp: App {
    // Required for APNs — device-token callbacks only reach a UIApplicationDelegate.
    @UIApplicationDelegateAdaptor(VictoryAppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .clerkEnvironment(publishableKey: Bundle.main.object(
                    forInfoDictionaryKey: "CLERK_PUBLISHABLE_KEY") as! String)
        }
    }
}
```

## Navigation flow

```
App launch (existing session) → SplashView → validate → .app / .paywall / .lapsed / .networkError
App launch (no session)       → SignInView
Sign in complete              → validate  → .app / .paywall / .lapsed / .networkError
Network unreachable           → NetworkErrorView (retry button, never locks user out)
.paywall / .lapsed           → Restore Access → re-validate (no purchase or portal link — Guideline 3.1.1)
.app                          → PushNotificationManager.enable() → APNs token POSTed to /api/push/apns
Any screen → Sign Out         → DELETE /api/push/apns → Clerk.shared.signOut() → SignInView
```

## Social login (Apple + Google)

`SignInView.swift` offers **Sign in with Apple** and **Continue with Google**, both
through the Clerk iOS SDK (`SignIn.authenticateWithRedirect(strategy: .oauth(...))`,
which uses `ASWebAuthenticationSession` — not an embedded webview, so Google's
`disallowed_useragent` block does not apply).

**App Store rule:** because we offer Google, Sign in with Apple is **mandatory**
(Guideline 4.8) and must be at least as prominent — hence Apple is listed first and
full-width. Do not remove it.

Setup steps (all one-time):

1. **Xcode** → target → Signing & Capabilities → **+ Capability → Sign in with Apple**.
2. **Apple Developer** → Identifiers → your App ID → enable **Sign in with Apple**.
   Create a **Services ID** and a **Sign in with Apple key (.p8)** for Clerk.
3. **Google Cloud Console** → APIs & Services → Credentials → create an **OAuth 2.0
   Web client** (Clerk uses the web client, even for the native SDK). Configure the
   OAuth consent screen (app name, logo, support email, privacy-policy + terms URLs).
4. **Clerk Dashboard** → **SSO Connections** → enable **Apple** (paste the Services
   ID, key ID, team ID, .p8) and **Google** (paste the client ID + secret). Enable
   the same two on the Clerk instance the web app uses so `/login` matches.
5. Confirm the redirect/callback URLs Clerk shows are registered in both the Apple
   Services ID and the Google client, and that `CFBundleURLSchemes` (above) is your
   bundle ID.

`fastlane` / manual review note: give App Review a working **demo account** (see the
project's App Store audit doc) — reviewers cannot complete Apple/Google OAuth.

## Image assets needed

Add these to `Assets.xcassets`:
- `victory-logo` — app logo
- `ic_google` — Google "G" logo (18×18, official brand asset)

(The Apple button uses the `apple.logo` SF Symbol — no asset needed. `ic_facebook`
is no longer used.)

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

1. **Xcode** → target → Signing & Capabilities → **+ Capability → Push Notifications**, and
   **+ Capability → Background Modes → Remote notifications**.
2. Add `@UIApplicationDelegateAdaptor(VictoryAppDelegate.self)` to the `@main` App (above), and
   add the new `Push/` folder to the app target.
3. **Apple Developer** → Keys → **+** → enable **Apple Push Notifications service (APNs)** →
   download `AuthKey_XXXXXXXXXX.p8` (it can only be downloaded once).
4. Set the four `APNS_*` Railway variables below. Until all four exist, iOS push silently no-ops.

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
