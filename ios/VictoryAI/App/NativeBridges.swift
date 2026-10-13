import WebKit
import SwiftUI
import RevenueCat
import RevenueCatUI

/// Message handlers the web app calls during training (frontend/src/lib/nativeBridge.js
/// and frontend/src/hooks/useLiveCoach.js). Like PushBridge, they only answer the main
/// frame of our own site.
class OriginCheckedBridge: NSObject, WKScriptMessageHandlerWithReply {
    private let allowedHost: String?

    init(allowedHost: String?) {
        self.allowedHost = allowedHost
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host == allowedHost,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            replyHandler(nil, "rejected")
            return
        }
        handle(action: action, body: body, webView: message.webView, reply: replyHandler)
    }

    func handle(action: String, body: [String: Any], webView: WKWebView?, reply: @escaping (Any?, String?) -> Void) {
        reply(nil, nil)
    }
}

/// `victoryMotion`: start/stop AirPods head tracking for the Live Coach.
final class MotionBridge: OriginCheckedBridge {
    static let name = "victoryMotion"

    override func handle(action: String, body: [String: Any], webView: WKWebView?, reply: @escaping (Any?, String?) -> Void) {
        Task { @MainActor [weak webView] in
            let tracker = HeadMotionTracker.shared
            if action == "start" {
                tracker.onMove = { [weak webView] in
                    webView?.evaluateJavaScript("window.__victoryHeadMove && window.__victoryHeadMove();")
                }
                reply(["available": tracker.start()], nil)
            } else {
                tracker.stop()
                reply(["available": false], nil)
            }
        }
    }
}

/// `victoryRound`: mirror the round clock to a Live Activity.
final class RoundBridge: OriginCheckedBridge {
    static let name = "victoryRound"

    override func handle(action: String, body: [String: Any], webView: WKWebView?, reply: @escaping (Any?, String?) -> Void) {
        let number = (body["round"] as? NSNumber)?.intValue ?? 1
        let total = (body["total"] as? NSNumber)?.intValue ?? number
        let resting = body["resting"] as? Bool ?? false
        let endsAtMs = (body["ends_at"] as? NSNumber)?.doubleValue ?? 0
        let secondsLeft = (body["seconds_left"] as? NSNumber)?.intValue ?? 0
        Task { @MainActor in
            let controller = LiveActivityController.shared
            if action == "end" {
                await controller.endRound()
            } else {
                await controller.updateRound(
                    number: number, total: total, resting: resting,
                    endsAt: Date(timeIntervalSince1970: endsAtMs / 1000),
                    paused: action == "pause", secondsLeft: secondsLeft
                )
            }
            reply(nil, nil)
        }
    }
}

/// `victoryStore`: opens RevenueCat's Customer Center (manage or cancel an App Store
/// subscription, request a refund, restore) from the web app's Billing page, or the App Store
/// paywall ("paywall") from any "Upgrade to Pro" button inside the app (Guideline 3.1.1).
final class StoreBridge: OriginCheckedBridge {
    static let name = "victoryStore"

    override func handle(action: String, body: [String: Any], webView: WKWebView?, reply: @escaping (Any?, String?) -> Void) {
        Task { @MainActor in
            guard ["customerCenter", "paywall"].contains(action), StoreManager.shared.isConfigured,
                  var top = webView?.window?.rootViewController else {
                reply(["shown": false], nil)
                return
            }
            while let presented = top.presentedViewController { top = presented }
            if action == "paywall" {
                top.present(UIHostingController(rootView: WebPaywallSheet(webView: webView)), animated: true)
            } else {
                top.present(UIHostingController(rootView: CustomerCenterView()), animated: true)
            }
            reply(["shown": true], nil)
        }
    }
}

/// `victoryHaptic`: Taptic Engine feedback for meaningful moments only (a real win, a sheet
/// snapping shut, a problem). frontend/src/lib/haptics.js decides when.
final class HapticBridge: OriginCheckedBridge {
    static let name = "victoryHaptic"

    override func handle(action: String, body: [String: Any], webView: WKWebView?, reply: @escaping (Any?, String?) -> Void) {
        Task { @MainActor in
            switch action {
            case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case "snap": UIImpactFeedbackGenerator(style: .light).impactOccurred()
            default: UISelectionFeedbackGenerator().selectionChanged()
            }
            reply(nil, nil)
        }
    }
}

/// The App Store paywall opened from inside the web app. After a purchase or restore the
/// server re-reads RevenueCat, then the page reloads so Pro features switch on straight away.
private struct WebPaywallSheet: View {
    weak var webView: WKWebView?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        RevenueCatUI.PaywallView(displayCloseButton: true)
            .onPurchaseCompleted { info in finish(info) }
            .onRestoreCompleted { info in finish(info) }
    }

    private func finish(_ info: RevenueCat.CustomerInfo) {
        Task { @MainActor in
            StoreManager.shared.apply(info)
            if StoreManager.shared.isPro {
                await AuthService.shared.syncPurchases()
                webView?.reload()
            }
            dismiss()
        }
    }
}
