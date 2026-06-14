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

<!-- Web subscription page — opened in SFSafariViewController -->
<key>SUBSCRIBE_URL</key>
<string>https://buy.stripe.com/7sY8wP8ED7qp6CP8qCaR200</string>

<!-- Stripe customer portal — for reactivation on LapsedSubscriptionView -->
<key>STRIPE_PORTAL_URL</key>
<string>https://billing.stripe.com/p/login/7sY8wP8ED7qp6CP8qCaR200</string>

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
```

## App entry point

Replace your default `ContentView` with `AppRootView`:

```swift
import SwiftUI
import ClerkSDK

@main
struct VictoryAIApp: App {
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
.paywall → Subscribe Now      → SFSafariViewController (Lovable web) → auto re-validate on return
.lapsed  → Reactivate         → SFSafariViewController (Stripe portal) → auto re-validate on return
Any screen → Sign Out         → Clerk.shared.signOut() → SignInView
```

## Image assets needed

Add these to `Assets.xcassets`:
- `victory-logo` — app logo
- `ic_google` — Google logo (20×20)
- `ic_facebook` — Facebook logo (20×20)

## Stub view to create

Only `MainAppView` is still a stub — create it to match your app's tab bar / home screen:

```swift
struct MainAppView: View {
    var body: some View { Text("Main App") }
}
```

## Environment variables on Railway (already set — confirm they exist)

| Variable | Purpose |
|---|---|
| `CLERK_SECRET_KEY` | Validate Clerk JWTs + fetch user details |
| `STRIPE_API_KEY` | Live-verify subscriptions |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures |
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | Database name (default: `victoryai`) |

## MongoDB — one-time backfill

Run this once in MongoDB Atlas / Compass to add `access_granted` to existing users:

```js
db.users.updateMany(
  { access_granted: { $exists: false } },
  { $set: { access_granted: true } }
)
```
