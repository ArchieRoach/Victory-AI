import SwiftUI
import ClerkSDK

@MainActor
final class SignInViewModel: ObservableObject {

    enum Destination: Identifiable {
        case app
        case paywall(reason: String)
        case error(message: String)

        var id: String {
            switch self {
            case .app:               return "app"
            case .paywall(let r):    return "paywall-\(r)"
            case .error(let m):      return "error-\(m)"
            }
        }
    }

    @Published var destination: Destination?
    @Published var isLoading = false

    /// Call this after Clerk reports sign-in is complete.
    func handleSignInComplete() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await AuthService.shared.validateAccess()

            if result.accessGranted {
                destination = .app
            } else {
                let reason = result.reason ?? "unknown"
                destination = .paywall(reason: reason)
            }

        } catch AuthError.noSession {
            try? await Clerk.shared.signOut()
            destination = .error(message: "Session expired. Please sign in again.")

        } catch AuthError.networkError {
            // Surface a retry-able error rather than kicking the user to paywall
            destination = .error(message: "No connection. Check your internet and try again.")

        } catch {
            destination = .error(message: error.localizedDescription)
        }
    }
}
