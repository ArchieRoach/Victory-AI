import SwiftUI
import RevenueCat
import RevenueCatUI

/// Shown when access_granted: false and reason is "no_subscription", "not_found", or "access_revoked".
/// Buying is App Store in-app purchase through RevenueCat's Paywall (designed in the RevenueCat
/// dashboard, so prices and layout change without an app update). Guideline 3.1.1 bans Stripe
/// here; a Stripe subscription bought on the web still unlocks via Restore (3.1.3(b)).
/// Without a RevenueCat key the plans button is hidden and only Restore is shown, as before.
struct MembershipGateView: View {
    let router: AppRouter
    let reason: String

    @State private var isValidating = false
    @State private var errorMessage: String?
    @State private var showPaywall = false
    @ObservedObject private var store = StoreManager.shared

    private var isRevoked: Bool { reason == "access_revoked" }
    private var canBuy: Bool { store.isConfigured && !isRevoked }

    var body: some View {
        ZStack {
            Color(hex: "#12121A").ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    Spacer().frame(height: 60)

                    iconBadge(
                        systemName: isRevoked ? "hand.raised.fill" : "lock.fill",
                        color: isRevoked ? .red : Color(hex: "#E8FF47")
                    )
                    .padding(.bottom, 28)

                    Text(isRevoked ? "Account Suspended" : "Membership Required")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.bottom, 12)

                    Text(isRevoked
                         ? "Your account access has been suspended.\nPlease contact support."
                         : canBuy
                            ? "Unlock Victory AI Pro: monthly, yearly or once for life."
                            : "This account doesn't have an active membership.\nAlready a member? Tap Restore Access."
                    )
                    .font(.subheadline)
                    .foregroundColor(Color(hex: "#8888A0"))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                    if !isRevoked {
                        featureList
                            .padding(.vertical, 32)
                    } else {
                        Spacer().frame(height: 40)
                    }

                    if let error = errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                            .padding(.bottom, 16)
                    }

                    actionButtons

                    Spacer().frame(height: 52)
                }
            }
        }
        .sheet(isPresented: $showPaywall) {
            RevenueCatUI.PaywallView(displayCloseButton: true)
                .onPurchaseCompleted { info in
                    Task { await unlock(after: info, restored: false) }
                }
                .onRestoreCompleted { info in
                    Task { await unlock(after: info, restored: true) }
                }
        }
    }

    // MARK: - Sub-views

    private var featureList: some View {
        VStack(alignment: .leading, spacing: 16) {
            FeatureRow(icon: "brain.fill",                  text: "AI-powered technique feedback")
            FeatureRow(icon: "chart.line.uptrend.xyaxis",   text: "Progress tracking & analytics")
            FeatureRow(icon: "figure.boxing",               text: "Personalized drill recommendations")
            FeatureRow(icon: "trophy.fill",                 text: "Leaderboards & competitions")
        }
        .padding(.horizontal, 40)
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            if canBuy {
                Button {
                    errorMessage = nil
                    showPaywall = true
                } label: {
                    Text("See plans")
                        .font(.headline)
                        .foregroundColor(Color(hex: "#12121A"))
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color(hex: "#E8FF47"))
                        .cornerRadius(14)
                }
            }

            // Restores App Store purchases (if set up) and re-validates against the backend,
            // which also unlocks a subscription bought on the web.
            Button {
                Task { await restore() }
            } label: {
                ZStack {
                    if isValidating {
                        ProgressView().tint(canBuy ? .white : Color(hex: "#12121A"))
                    } else {
                        Text(canBuy ? "Restore Purchases" : "Restore Access")
                            .font(canBuy ? .subheadline : .headline)
                            .foregroundColor(canBuy ? Color(hex: "#C0C0D0") : Color(hex: "#12121A"))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: canBuy ? 44 : 52)
                .background(canBuy ? Color.clear : Color(hex: "#E8FF47"))
                .cornerRadius(14)
            }
            .disabled(isValidating)

            if isRevoked {
                Link("Contact Support",
                     destination: URL(string: "mailto:hello@victoryai.co.uk")!)
                    .font(.subheadline)
                    .foregroundColor(Color(hex: "#8888A0"))
                    .padding(.top, 4)
            }

            Button {
                Task { await router.signOut() }
            } label: {
                Text("Sign Out")
                    .font(.subheadline)
                    .foregroundColor(Color(hex: "#8888A0"))
            }
            .padding(.top, isRevoked ? 0 : 4)
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Actions

    /// After the paywall reports a purchase or restore: tell the server to re-read RevenueCat,
    /// then re-validate. The server, not this device, decides access.
    private func unlock(after info: CustomerInfo, restored: Bool) async {
        store.apply(info)
        showPaywall = false
        guard store.isPro else {
            if restored { errorMessage = "No purchases found for this Apple ID." }
            return
        }
        await AuthService.shared.syncPurchases()
        await router.validate()
        if case .paywall = router.appState {
            errorMessage = "Payment received. Unlocking can take a minute: tap Restore Purchases if it doesn't open."
        }
    }

    private func restore() async {
        guard !isValidating else { return }
        isValidating = true
        errorMessage = nil
        defer { isValidating = false }

        if store.isConfigured {
            do {
                _ = try await store.restore()
                await AuthService.shared.syncPurchases()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        await router.validate()

        if case .paywall = router.appState, errorMessage == nil {
            errorMessage = "No active membership found for this account."
        }
    }

    // MARK: - Helpers

    private func iconBadge(systemName: String, color: Color) -> some View {
        ZStack {
            Circle()
                .fill(color.opacity(0.12))
                .frame(width: 96, height: 96)
            Image(systemName: systemName)
                .font(.system(size: 36, weight: .semibold))
                .foregroundColor(color)
        }
    }
}

// MARK: - Reusable feature row

struct FeatureRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Color(hex: "#E8FF47"))
                .frame(width: 22)
            Text(text)
                .font(.subheadline)
                .foregroundColor(Color(hex: "#C0C0D0"))
            Spacer()
        }
    }
}
