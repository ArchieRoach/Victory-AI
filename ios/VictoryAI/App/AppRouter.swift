import SwiftUI
import ClerkSDK

/// Global navigation state machine.
/// Owned by AppRootView; passed down to screens that need to trigger transitions.
@MainActor
final class AppRouter: ObservableObject {

    enum AppState: Equatable {
        case loading
        case signIn
        case app
        case paywall(reason: String)
        case lapsed
        case networkError(message: String)

        static func == (lhs: AppState, rhs: AppState) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading), (.signIn, .signIn), (.app, .app), (.lapsed, .lapsed):
                return true
            case (.paywall(let a), .paywall(let b)):
                return a == b
            case (.networkError(let a), .networkError(let b)):
                return a == b
            default:
                return false
            }
        }
    }

    @Published var appState: AppState = .loading

    // MARK: - Actions

    /// Re-validates the current Clerk session against the Railway backend.
    /// Safe to call on every app launch and after sign-in.
    func validate() async {
        do {
            let result = try await AuthService.shared.validateAccess()
            appState = result.accessGranted ? .app : stateForReason(result.reason)
        } catch AuthError.noSession, AuthError.tokenFetchFailed {
            appState = .signIn
        } catch AuthError.serverError(let code, _) where code == 401 {
            appState = .signIn
        } catch AuthError.networkError(let underlying) {
            appState = .networkError(message: underlying.localizedDescription)
        } catch {
            appState = .networkError(message: error.localizedDescription)
        }
    }

    func signOut() async {
        try? await Clerk.shared.signOut()
        appState = .signIn
    }

    // MARK: - Private

    private func stateForReason(_ reason: String?) -> AppState {
        switch reason {
        case "subscription_lapsed", "subscription_inactive":
            return .lapsed
        default:
            return .paywall(reason: reason ?? "no_subscription")
        }
    }
}
