import WebKit
import SwiftUI
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
/// subscription, request a refund, restore) from the web app's Billing page.
final class StoreBridge: OriginCheckedBridge {
    static let name = "victoryStore"

    override func handle(action: String, body: [String: Any], webView: WKWebView?, reply: @escaping (Any?, String?) -> Void) {
        Task { @MainActor in
            guard action == "customerCenter", StoreManager.shared.isConfigured,
                  var top = webView?.window?.rootViewController else {
                reply(["shown": false], nil)
                return
            }
            while let presented = top.presentedViewController { top = presented }
            top.present(UIHostingController(rootView: CustomerCenterView()), animated: true)
            reply(["shown": true], nil)
        }
    }
}
