import UIKit
import UserNotifications

/// APNs callbacks only reach a UIApplicationDelegate. Attach it in the @main App struct:
///
///     @UIApplicationDelegateAdaptor(VictoryAppDelegate.self) var appDelegate
final class VictoryAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Must be set before launch finishes or a tap that cold-launches the app is lost.
        UNUserNotificationCenter.current().delegate = PushNotificationManager.shared
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushNotificationManager.shared.didRegister(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs registration failed: \(error.localizedDescription)")
    }
}
