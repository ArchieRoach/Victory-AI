import SwiftUI

/// Shown when access_granted: false and reason is "subscription_lapsed" or "subscription_inactive".
/// Reactivation goes through the Stripe customer portal (web, via SFSafariViewController).
struct LapsedSubscriptionView: View {
    let router: AppRouter

    @State private var showPortal = false
    @State private var isValidating = false
    @State private var errorMessage: String?

    private let portalURL: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "STRIPE_PORTAL_URL") as? String
            ?? "https://billing.stripe.com/p/login/YOUR_PORTAL_ID"
        return URL(string: raw)!
    }()

    var body: some View {
        ZStack {
            Color(hex: "#12121A").ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Icon
                ZStack {
                    Circle()
                        .fill(Color.orange.opacity(0.12))
                        .frame(width: 96, height: 96)
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.orange)
                }
                .padding(.bottom, 28)

                Text("Subscription Expired")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.bottom, 12)

                Text("Your subscription has ended.\nReactivate to get back to training.")
                    .font(.subheadline)
                    .foregroundColor(Color(hex: "#8888A0"))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer().frame(height: 44)

                if let error = errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.bottom, 16)
                }

                VStack(spacing: 12) {
                    // Opens Stripe customer portal — reactivation without native IAP
                    Button { showPortal = true } label: {
                        Text("Reactivate Subscription")
                            .font(.headline)
                            .foregroundColor(Color(hex: "#12121A"))
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(Color(hex: "#E8FF47"))
                            .cornerRadius(14)
                    }

                    // Re-validates in case user already reactivated in a web browser
                    Button {
                        Task { await restore() }
                    } label: {
                        ZStack {
                            if isValidating {
                                ProgressView().tint(Color(hex: "#E8FF47"))
                            } else {
                                Text("Restore Access")
                                    .font(.headline)
                                    .foregroundColor(Color(hex: "#E8FF47"))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color(hex: "#E8FF47").opacity(0.12))
                        .cornerRadius(14)
                    }
                    .disabled(isValidating)

                    Button {
                        Task { await router.signOut() }
                    } label: {
                        Text("Sign Out")
                            .font(.subheadline)
                            .foregroundColor(Color(hex: "#8888A0"))
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 24)

                Spacer().frame(height: 52)
            }
        }
        // Stripe customer portal inside the app
        .sheet(isPresented: $showPortal) {
            SafariBrowser(url: portalURL)
                .ignoresSafeArea()
                .onDisappear {
                    // Auto re-validate when user returns from the Stripe portal
                    Task { await restore() }
                }
        }
    }

    // MARK: - Actions

    private func restore() async {
        guard !isValidating else { return }
        isValidating = true
        errorMessage = nil
        defer { isValidating = false }

        await router.validate()

        if case .lapsed = router.appState {
            errorMessage = "Subscription still inactive. Complete reactivation in the portal above."
        }
    }
}
