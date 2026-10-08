import SwiftUI
import RevenueCat

/// Shown when access_granted: false and reason is "no_subscription", "not_found", or "access_revoked".
/// Buying here is App Store in-app purchase through RevenueCat (Guideline 3.1.1 bans Stripe
/// in the app); a Stripe subscription bought on the web still unlocks via Restore (3.1.3(b)).
/// Without a RevenueCat key the plans are hidden and only Restore is shown, as before.
struct PaywallView: View {
    let router: AppRouter
    let reason: String

    @State private var isValidating = false
    @State private var errorMessage: String?
    @State private var buying: String?
    @ObservedObject private var store = StoreManager.shared

    private var canBuy: Bool { store.isConfigured && !isRevoked }
    private var webURL: String {
        (Bundle.main.object(forInfoDictionaryKey: "WEB_APP_URL") as? String ?? "https://victory-ai-alpha.vercel.app")
            .trimmingCharacters(in: .whitespaces)
    }

    private var isRevoked: Bool { reason == "access_revoked" }

    var body: some View {
        ZStack {
            Color(hex: "#12121A").ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    Spacer().frame(height: 60)

                    // Icon
                    iconBadge(
                        systemName: isRevoked ? "hand.raised.fill" : "lock.fill",
                        color: isRevoked ? .red : Color(hex: "#E8FF47")
                    )
                    .padding(.bottom, 28)

                    // Heading
                    Text(isRevoked ? "Account Suspended" : "Membership Required")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.bottom, 12)

                    Text(isRevoked
                         ? "Your account access has been suspended.\nPlease contact support."
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

                    if canBuy {
                        planButtons
                            .padding(.bottom, 16)
                    }

                    actionButtons

                    if canBuy {
                        disclosure
                            .padding(.top, 20)
                    }

                    Spacer().frame(height: 52)
                }
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

    private var planButtons: some View {
        VStack(spacing: 12) {
            if store.isLoadingPackages && store.packages.isEmpty {
                ProgressView().tint(Color(hex: "#E8FF47")).frame(height: 52)
            }
            ForEach(store.packages, id: \.identifier) { package in
                Button {
                    Task { await buy(package) }
                } label: {
                    VStack(spacing: 2) {
                        if buying == package.identifier {
                            ProgressView().tint(Color(hex: "#12121A"))
                        } else {
                            Text(package.planTitle)
                                .font(.headline)
                            Text([package.trialText, "\(package.storeProduct.localizedPriceString) / \(package.periodLabel)"]
                                    .compactMap { $0 }.joined(separator: " "))
                                .font(.caption)
                        }
                    }
                    .foregroundColor(package.packageType == .annual ? Color(hex: "#12121A") : .white)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 56)
                    .background(package.packageType == .annual ? Color(hex: "#E8FF47") : Color(hex: "#1A1A26"))
                    .cornerRadius(14)
                }
                .disabled(buying != nil)
            }
        }
        .padding(.horizontal, 24)
        .task { await store.loadPackages() }
    }

    /// Apple requires the price, length, auto-renewal and links to terms and privacy on the
    /// purchase screen itself.
    private var disclosure: some View {
        VStack(spacing: 8) {
            Text("Subscriptions renew automatically at the price shown until cancelled. Cancel any time in Settings → your name → Subscriptions, at least 24 hours before the renewal date. Payment is charged to your Apple ID.")
                .font(.caption2)
                .foregroundColor(Color(hex: "#8888A0"))
                .multilineTextAlignment(.center)
            HStack(spacing: 16) {
                Link("Terms of Use", destination: URL(string: webURL + "/terms")!)
                Link("Privacy Policy", destination: URL(string: webURL + "/privacy")!)
            }
            .font(.caption)
            .foregroundColor(Color(hex: "#8888A0"))
        }
        .padding(.horizontal, 32)
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
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
                     destination: URL(string: "mailto:support@victoryai.app")!)
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

    private func buy(_ package: Package) async {
        guard buying == nil else { return }
        buying = package.identifier
        errorMessage = nil
        defer { buying = nil }
        do {
            guard try await store.purchase(package) else { return }
            await AuthService.shared.syncPurchases()
            await router.validate()
            if case .paywall = router.appState {
                errorMessage = "Payment received. Unlocking can take a minute: tap Restore Purchases if it doesn't open."
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func restore() async {
        guard !isValidating else { return }
        isValidating = true
        errorMessage = nil
        defer { isValidating = false }

        if store.isConfigured {
            try? await store.restore()
            await AuthService.shared.syncPurchases()
        }
        await router.validate()

        // If still on paywall, surface a hint
        if case .paywall = router.appState {
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
