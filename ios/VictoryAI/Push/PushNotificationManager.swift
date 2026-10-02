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

    private static let backend: String = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "BACKEND_URL") as? String
            ?? "https://YOUR_RAILWAY_BACKEND_URL"
        return raw.trimmingCharacters(in: .whitespaces)
    }()
    private static let endpoint = URL(string: backend + "/api/push/apns")!
    private static let liveActivityEndpoint = URL(string: backend + "/api/push/live-activity-token")!

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
            LiveActivityController.shared.observePushToStartTokens { token in
                await PushNotificationManager.shared.post(
                    method: "POST", url: Self.liveActivityEndpoint,
                    body: ["token": token, "environment": Self.environment]
                )
            }
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
        Task { await post(method: "POST", url: Self.endpoint, body: ["device_token": token, "environment": Self.environment]) }
    }

    /// Call before signing out so the next account on this device doesn't get this user's pushes.
    func disable() async {
        await post(method: "DELETE", url: Self.liveActivityEndpoint, body: [:])
        guard let token = deviceToken else { return }
        await post(method: "DELETE", url: Self.endpoint, body: ["device_token": token, "environment": Self.environment])
        deviceToken = nil
    }

    func takePendingPath() -> String? {
        defer { pendingPath = nil }
        return pendingPath
    }

    /// Opens a path in the web view — from a notification tap or a Siri shortcut.
    func open(path: String) {
        pendingPath = path
        NotificationCenter.default.post(name: Self.openPathNotification, object: nil, userInfo: ["path": path])
    }

    private func post(method: String, url: URL, body: [String: String]) async {
        guard let jwt = await ClerkSession.token() else { return }

        var request = URLRequest(url: url, timeoutInterval: 10)
        request.httpMethod = method
        request.setValue("Bearer \(jwt)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !body.isEmpty {
            request.httpBody = try? JSONEncoder().encode(body)
        }
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
