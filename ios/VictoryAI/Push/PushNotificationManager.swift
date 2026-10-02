import UIKit
import UserNotifications

/// Registers this device with APNs and hands the token to the backend, which sends
/// the same notifications as web push (see `_send_apns` in backend/server.py).
@MainActor
final class PushNotificationManager: NSObject {
    static let shared = PushNotificationManager()
    static let openPathNotification = Notification.Name("VictoryAIPushOpenPath")

    private var deviceToken: String?
    /// Set when a notification is tapped before the web view exists (cold launch).
    private var pendingPath: String?

    private static let endpoint: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "BACKEND_URL") as? String
            ?? "https://YOUR_RAILWAY_BACKEND_URL"
        return URL(string: raw.trimmingCharacters(in: .whitespaces) + "/api/push/apns")!
    }()

    // Debug builds from Xcode get sandbox tokens; TestFlight and App Store builds get production ones.
    private static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    private static let optOutKey = "pushOptedOut"

    /// Set when the fighter switches notifications off in the web app's Profile.
    private var optedOut: Bool {
        get { UserDefaults.standard.bool(forKey: Self.optOutKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.optOutKey) }
    }

    /// Call on every signed-in launch. Re-registers if already allowed; never prompts —
    /// iOS only lets us ask once, so the web app asks at a moment that makes sense (PushBridge).
    func resume() async {
        guard !optedOut else { return }
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status == .authorized || status == .provisional || status == .ephemeral {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func request() async -> [String: Any] {
        optedOut = false
        let center = UNUserNotificationCenter.current()
        if await center.notificationSettings().authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
        await resume()
        return await state()
    }

    func optOut() async -> [String: Any] {
        optedOut = true
        await disable()
        return await state()
    }

    /// Shaped like the web Notification API so the web app treats both the same.
    func state() async -> [String: Any] {
        let permission: String
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .denied: permission = "denied"
        case .notDetermined: permission = "default"
        default: permission = "granted"
        }
        return ["permission": permission, "subscribed": permission == "granted" && !optedOut]
    }

    func didRegister(deviceToken data: Data) {
        let token = data.map { String(format: "%02x", $0) }.joined()
        deviceToken = token
        Task { await send(method: "POST", token: token) }
    }

    /// Call before signing out so the next account on this device doesn't get this user's pushes.
    func disable() async {
        guard let token = deviceToken else { return }
        await send(method: "DELETE", token: token)
        deviceToken = nil
    }

    func takePendingPath() -> String? {
        defer { pendingPath = nil }
        return pendingPath
    }

    fileprivate func open(path: String) {
        pendingPath = path
        NotificationCenter.default.post(name: Self.openPathNotification, object: nil, userInfo: ["path": path])
    }

    private func send(method: String, token: String) async {
        guard let jwt = await ClerkSession.token() else { return }

        var request = URLRequest(url: Self.endpoint, timeoutInterval: 10)
        request.httpMethod = method
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["device_token": token, "environment": Self.environment])
        _ = try? await URLSession.shared.data(for: request)
    }
}

extension PushNotificationManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let path = response.notification.request.content.userInfo["url"] as? String,
              path.hasPrefix("/") else { return }
        await MainActor.run { PushNotificationManager.shared.open(path: path) }
    }
}
