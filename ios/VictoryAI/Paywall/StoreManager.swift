import Foundation
import RevenueCat

/// App Store purchases through RevenueCat. Apple rule 3.1.1 means Pro bought inside the app
/// must use in-app purchase, so this is the only way to buy here (Stripe stays on the web).
/// The RevenueCat app user id is our backend user id (the Clerk id), so the server can look
/// the purchase up itself: the app never tells the server "I'm Pro".
@MainActor
final class StoreManager: ObservableObject {
    static let shared = StoreManager()

    @Published private(set) var packages: [Package] = []
    @Published private(set) var isLoadingPackages = false
    private(set) var isConfigured = false

    /// Off until REVENUECAT_API_KEY (the public `appl_…` key) is set, so builds without it
    /// keep the old restore-only paywall instead of crashing.
    func configureIfNeeded() {
        guard !isConfigured else { return }
        let key = (Bundle.main.object(forInfoDictionaryKey: "REVENUECAT_API_KEY") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard key.hasPrefix("appl_") else { return }
        Purchases.logLevel = .warn
        Purchases.configure(withAPIKey: key)
        isConfigured = true
    }

    func logIn(userId: String) async {
        guard isConfigured else { return }
        _ = try? await Purchases.shared.logIn(userId)
    }

    func logOut() async {
        guard isConfigured, !Purchases.shared.isAnonymous else { return }
        _ = try? await Purchases.shared.logOut()
    }

    func loadPackages() async {
        guard isConfigured, packages.isEmpty else { return }
        isLoadingPackages = true
        defer { isLoadingPackages = false }
        let offerings = try? await Purchases.shared.offerings()
        // Annual first: it's the better deal and the one most people pick.
        let rank: (Package) -> Int = { $0.packageType == .annual ? 0 : 1 }
        packages = (offerings?.current?.availablePackages ?? []).sorted { rank($0) < rank($1) }
    }

    /// Returns false if the person cancelled the Apple sheet.
    func purchase(_ package: Package) async throws -> Bool {
        let result = try await Purchases.shared.purchase(package: package)
        return !result.userCancelled
    }

    func restore() async throws {
        _ = try await Purchases.shared.restorePurchases()
    }
}

extension Package {
    var planTitle: String {
        switch packageType {
        case .annual: return "Yearly"
        case .monthly: return "Monthly"
        default: return storeProduct.localizedTitle
        }
    }

    var periodLabel: String {
        switch packageType {
        case .annual: return "year"
        case .monthly: return "month"
        default: return "period"
        }
    }

    /// e.g. "7-day free trial, then", shown only when the App Store product really has one.
    var trialText: String? {
        guard let intro = storeProduct.introductoryDiscount, intro.paymentMode == .freeTrial else { return nil }
        let p = intro.subscriptionPeriod
        let unit: String
        switch p.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "day"
        }
        return "\(p.value)-\(unit) free trial, then"
    }
}
