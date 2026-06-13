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

```swift
import SwiftUI
import ClerkSDK

@main
struct VictoryAIApp: App {
    var body: some Scene {
        WindowGroup {
            // Clerk session is checked inside SignInView / SignInViewModel
            SignInView()
                .clerkEnvironment(publishableKey: Bundle.main.object(
                    forInfoDictionaryKey: "CLERK_PUBLISHABLE_KEY") as! String)
        }
    }
}
```

## Image assets needed

Add these to `Assets.xcassets`:
- `victory-logo` — app logo
- `ic_google` — Google logo (20×20)
- `ic_facebook` — Facebook logo (20×20)

## Stub views to create

`MainAppView.swift` and `PaywallView.swift` are referenced by `SignInViewModel`
but not included here — create them to match your app's screens.

```swift
struct MainAppView: View {
    var body: some View { Text("Main App") }
}

struct PaywallView: View {
    let reason: String
    var body: some View { Text("Subscribe to continue (\(reason))") }
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
