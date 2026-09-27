import SwiftUI

/// Shown when access_granted: false and reason is "no_subscription", "not_found", or "access_revoked".
/// No purchase button or link: Guideline 3.1.1 bans Stripe checkout in the app, and the
/// 3.1.3(b) multiplatform exception only lets us unlock a subscription bought elsewhere.
struct PaywallView: View {
    let router: AppRouter
    let reason: String

    @State private var isValidating = false
    @State private var errorMessage: String?

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

                    actionButtons

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

    private var actionButtons: some View {
        VStack(spacing: 12) {
            // Primary action: re-validates against the backend
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

    private func restore() async {
        guard !isValidating else { return }
        isValidating = true
        errorMessage = nil
        defer { isValidating = false }

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
