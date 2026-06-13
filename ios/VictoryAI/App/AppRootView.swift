import SwiftUI
import ClerkSDK

/// Entry point for the app. Owns the AppRouter and renders the correct screen
/// based on current auth/subscription state.
///
/// Usage — replace the default ContentView in your @main App struct:
///
///     WindowGroup {
///         AppRootView()
///             .clerkEnvironment(publishableKey: "pk_live_...")
///     }
struct AppRootView: View {
    @StateObject private var router = AppRouter()

    var body: some View {
        ZStack {
            Color(hex: "#12121A").ignoresSafeArea()

            switch router.appState {
            case .loading:
                SplashView()

            case .signIn:
                SignInView(router: router)

            case .app:
                MainAppView()

            case .paywall(let reason):
                PaywallView(router: router, reason: reason)

            case .lapsed:
                LapsedSubscriptionView(router: router)

            case .networkError(let message):
                NetworkErrorView(message: message) {
                    // Retry: re-validate if session exists, otherwise go to sign-in
                    Task {
                        if await Clerk.shared.session != nil {
                            await router.validate()
                        } else {
                            router.appState = .signIn
                        }
                    }
                }
            }
        }
        // On every app launch, re-validate — never rely on a cached access_granted.
        .task {
            if await Clerk.shared.session != nil {
                await router.validate()
            } else {
                router.appState = .signIn
            }
        }
        // Animated transitions between states
        .animation(.easeInOut(duration: 0.25), value: router.appState)
    }
}
