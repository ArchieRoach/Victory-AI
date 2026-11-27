import SwiftUI
import ClerkKit

@main
struct VictoryAIApp: App {
    // APNs device-token callbacks only reach a UIApplicationDelegate.
    @UIApplicationDelegateAdaptor(VictoryAppDelegate.self) var appDelegate

    init() {
        let key = Bundle.main.object(forInfoDictionaryKey: "CLERK_PUBLISHABLE_KEY") as? String ?? ""
        Clerk.configure(publishableKey: key)
        StoreManager.shared.configureIfNeeded()
    }

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environment(Clerk.shared)
                .preferredColorScheme(.dark)
                // Home screen widget taps arrive as <bundle id>://open/<path>, e.g. /train.
                .onOpenURL { url in
                    guard url.host == "open" else { return }
                    let path = url.path.isEmpty ? "/train" : url.path
                    Task { @MainActor in PushNotificationManager.shared.open(path: path) }
                }
        }
    }
}
