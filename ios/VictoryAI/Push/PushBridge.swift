import WebKit

/// Lets the web app ask for notification permission when push is worth something to the
/// fighter (e.g. right after booking a round) instead of on launch. From the page:
///
///     await window.webkit.messageHandlers.victoryPush.postMessage({ action: "status" | "enable" | "disable" })
///
/// resolves to `{ permission: "default" | "granted" | "denied", subscribed: Bool }`.
final class PushBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "victoryPush"

    private let allowedHost: String?

    init(allowedHost: String?) {
        self.allowedHost = allowedHost
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        // Only our own site, never a page the web view was navigated to.
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host == allowedHost,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            replyHandler(nil, "rejected")
            return
        }
        Task { @MainActor in
            let manager = PushNotificationManager.shared
            switch action {
            case "enable": replyHandler(await manager.request(), nil)
            case "disable": replyHandler(await manager.optOut(), nil)
            default: replyHandler(await manager.state(), nil)
            }
        }
    }
}
