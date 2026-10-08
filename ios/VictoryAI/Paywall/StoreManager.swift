import Foundation
import RevenueCat

/// App Store purchases through RevenueCat. Apple rule 3.1.1 means Pro bought inside the app
/// must use in-app purchase, so this is the only way to buy here (Stripe stays on the web).
///
/// The RevenueCat app user id is our backend user id (the Clerk id), so the server looks the
/// purchase up itself and the app never tells the server "I'm Pro". `isPro` here is only for
/// instant UI feedback; access is always decided by the backend's /auth/validate.
@MainActor
final class StoreManager: ObservableObject {
    static let shared = StoreManager()

    /// Must match the entitlement identifier in the RevenueCat dashboard (and the server's
    /// REVENUECAT_ENTITLEMENT).
    static let entitlementID = "victory_ai_pro"

    @Published private(set) var customerInfo: CustomerInfo?
    @Published private(set) var isPro = false
    private(set) var isConfigured = false
    private var infoTask: Task<Void, Never>?

    /// REVENUECAT_API_KEY comes from Info.plist (GitHub variable REVENUECAT_IOS_API_KEY):
    /// `test_…` is the RevenueCat Test Store (works before the App Store is set up; never ship
    /// it to the App Store), `appl_…` is the real App Store key. Empty = purchases off and the
    /// paywall falls back to restore-only.
    func configureIfNeeded() {
        guard !isConfigured else { return }
        let key = (Bundle.main.object(forInfoDictionaryKey: "REVENUECAT_API_KEY") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard key.hasPrefix("appl_") || key.hasPrefix("test_") else { return }
        #if DEBUG
        Purchases.logLevel = .debug
        #else
        Purchases.logLevel = .warn
        #endif
        Purchases.configure(withAPIKey: key)
        isConfigured = true
        // Every change (purchase, renewal, expiry, restore, another device) arrives here.
        infoTask = Task { [weak self] in
            for await info in Purchases.shared.customerInfoStream {
                self?.apply(info)
            }
        }
    }

    func logIn(userId: String) async {
        guard isConfigured else { return }
        do {
            let (info, _) = try await Purchases.shared.logIn(userId)
            apply(info)
        } catch {
            print("[RevenueCat] logIn failed: \(error.localizedDescription)")
        }
    }

    func logOut() async {
        guard isConfigured, !Purchases.shared.isAnonymous else { return }
        _ = try? await Purchases.shared.logOut()
        customerInfo = nil
        isPro = false
    }

    @discardableResult
    func refreshCustomerInfo() async -> CustomerInfo? {
        guard isConfigured else { return nil }
        do {
            let info = try await Purchases.shared.customerInfo()
            apply(info)
            return info
        } catch {
            print("[RevenueCat] customerInfo failed: \(error.localizedDescription)")
            return nil
        }
    }

    /// Restores App Store purchases made on this Apple ID (required by App Review).
    func restore() async throws -> CustomerInfo {
        let info = try await Purchases.shared.restorePurchases()
        apply(info)
        return info
    }

    func apply(_ info: CustomerInfo) {
        customerInfo = info
        isPro = info.entitlements[Self.entitlementID]?.isActive == true
    }
}
