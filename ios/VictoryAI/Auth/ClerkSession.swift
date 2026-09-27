import ClerkKit

/// Clerk is MainActor-bound and its Session isn't Sendable, so other actors
/// (AuthService, the web view coordinator) get a plain String token through here.
@MainActor
enum ClerkSession {
    static var isSignedIn: Bool { Clerk.shared.session != nil }

    static func token() async -> String? {
        guard isSignedIn else { return nil }
        return try? await Clerk.shared.auth.getToken()
    }
}
