import SwiftUI
import ClerkKit

@main
struct VictoryAIApp: App {
    // APNs device-token callbacks only reach a UIApplicationDelegate.
    @UIApplicationDelegateAdaptor(VictoryAppDelegate.self) var appDelegate

    init() {
        let key = Bundle.main.object(forInfoDictionaryKey: "CLERK_PUBLISHABLE_KEY") as? String ?? ""
        Clerk.configure(publishableKey: key)
    }

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environment(Clerk.shared)
                .preferredColorScheme(.dark)
        }
    }
}
