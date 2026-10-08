import SwiftUI

/// Shown when access_granted: false and reason is "subscription_lapsed" or "subscription_inactive".
/// "See plans" re-subscribes through the App Store (PaywallView); never a link to Stripe.
struct LapsedSubscriptionView: View {
    let router: AppRouter

    @State private var isValidating = false
    @State private var errorMessage: String?

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

                Text("Your subscription has ended.\nIf you've renewed, tap Restore Access.")
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
                    // Primary action: re-validates in case the subscription was renewed on another device
                    Button {
                        Task { await restore() }
                    } label: {
                        ZStack {
                            if isValidating {
                                ProgressView().tint(Color(hex: "#12121A"))
                            } else {
                                Text("Restore Access")
                                    .font(.headline)
                                    .foregroundColor(Color(hex: "#12121A"))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color(hex: "#E8FF47"))
                        .cornerRadius(14)
                    }
                    .disabled(isValidating)

                    if StoreManager.shared.isConfigured {
                        Button {
                            router.appState = .paywall(reason: "no_subscription")
                        } label: {
                            Text("See plans")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(hex: "#E8FF47"))
                        }
                    }

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
    }

    // MARK: - Actions

    private func restore() async {
        guard !isValidating else { return }
        isValidating = true
        errorMessage = nil
        defer { isValidating = false }

        await router.validate()

        if case .lapsed = router.appState {
            errorMessage = "Subscription still inactive."
        }
    }
}
