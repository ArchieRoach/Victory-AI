import SwiftUI
import ClerkSDK

@MainActor
final class SignInViewModel: ObservableObject {
    @Published var isLoading = false

    private let router: AppRouter

    init(router: AppRouter) {
        self.router = router
    }

    /// Called after Clerk confirms sign-in is complete.
    /// Delegates all routing decisions to AppRouter.
    func handleSignInComplete() async {
        isLoading = true
        defer { isLoading = false }
        await router.validate()
    }
}
