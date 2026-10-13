import SwiftUI
import WebKit
import SafariServices

/// Hosts the existing Victory AI web app (React, deployed on Vercel) inside the
/// native shell. Only Auth/Paywall/Splash/NetworkError are truly native —
/// everything past sign-in reuses the same web codebase, kept authenticated
/// via a Clerk token bridge (see `window.__setMobileAuthToken` in
/// frontend/src/App.js).
struct MainAppView: View {
    @StateObject private var loader = WebLoadState()

    var body: some View {
        ZStack {
            WebAppContainer(loader: loader)
                .ignoresSafeArea(edges: .bottom)
            // A failed load used to leave a blank screen (App Review flags that as a bug).
            if let message = loader.failure {
                NetworkErrorView(message: message) { loader.retry() }
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: loader.failure)
    }
}

@MainActor
final class WebLoadState: ObservableObject {
    @Published var failure: String?
    weak var webView: WKWebView?

    func retry() {
        failure = nil
        if let webView, webView.url != nil { webView.reload() } else { webView?.load(URLRequest(url: WebAppContainer.webAppURL)) }
    }
}

struct WebAppContainer: UIViewRepresentable {
    let loader: WebLoadState

    static let webAppURL: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "WEB_APP_URL") as? String
            ?? "https://YOUR_VERCEL_URL"
        return URL(string: raw.trimmingCharacters(in: .whitespaces))!
    }()

    static func url(forPath path: String?) -> URL {
        guard let path, path.hasPrefix("/"),
              let url = URL(string: path, relativeTo: webAppURL) else { return webAppURL }
        return url.absoluteURL
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // The web app hides every Stripe purchase surface when it sees this tag
        // (frontend/src/lib/nativeShell.js) — App Store Guideline 3.1.1.
        config.applicationNameForUserAgent = "Mobile/15E148 VictoryAI-iOS"
        let host = Self.webAppURL.host
        let scripts = config.userContentController
        scripts.addScriptMessageHandler(PushBridge(allowedHost: host), contentWorld: .page, name: PushBridge.name)
        scripts.addScriptMessageHandler(MotionBridge(allowedHost: host), contentWorld: .page, name: MotionBridge.name)
        scripts.addScriptMessageHandler(RoundBridge(allowedHost: host), contentWorld: .page, name: RoundBridge.name)
        scripts.addScriptMessageHandler(StoreBridge(allowedHost: host), contentWorld: .page, name: StoreBridge.name)
        scripts.addScriptMessageHandler(HapticBridge(allowedHost: host), contentWorld: .page, name: HapticBridge.name)
        // Live Coach watches the camera preview in the page, so it must play inline.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        loader.webView = webView
        context.coordinator.loader = loader
        let initialPath = PushNotificationManager.shared.takePendingPath()
        webView.load(URLRequest(url: Self.url(forPath: initialPath)))
        context.coordinator.startTokenRefresh(for: webView)
        context.coordinator.observePushTaps()
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    /// Clerk session JWTs are short-lived (~60s), so this re-pushes a fresh
    /// token into the page on load and every 45s rather than injecting once.
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private weak var webView: WKWebView?
        weak var loader: WebLoadState?
        private var timer: Timer?

        func startTokenRefresh(for webView: WKWebView) {
            self.webView = webView
            refreshToken()
            timer = Timer.scheduledTimer(withTimeInterval: 45, repeats: true) { [weak self] _ in
                self?.refreshToken()
            }
        }

        private var pushObserver: NSObjectProtocol?

        func observePushTaps() {
            pushObserver = NotificationCenter.default.addObserver(
                forName: PushNotificationManager.openPathNotification, object: nil, queue: .main
            ) { [weak self] note in
                guard let path = note.userInfo?["path"] as? String else { return }
                MainActor.assumeIsolated {
                    _ = PushNotificationManager.shared.takePendingPath()
                    self?.webView?.load(URLRequest(url: WebAppContainer.url(forPath: path)))
                }
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loader?.failure = nil
            refreshToken()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showFailure(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showFailure(error)
        }

        private func showFailure(_ error: Error) {
            let code = (error as NSError).code
            // Cancelled loads (a new navigation replacing one in flight) aren't failures.
            guard code != NSURLErrorCancelled, code != 102 else { return }
            loader?.failure = "Victory AI couldn't load. Check your connection and try again."
        }

        // The web app stays in the app; every other site opens in an in-app Safari sheet,
        // and mail/phone links go to their own apps. Without this, outside links did nothing.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { return decisionHandler(.allow) }
            let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? false
            if ["mailto", "tel", "sms", "itms-apps"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
                return decisionHandler(.cancel)
            }
            let host = url.host ?? ""
            let ours = host == WebAppContainer.webAppURL.host || host.contains("clerk")
            if isMainFrame, ["http", "https"].contains(url.scheme ?? ""), !ours {
                openOutside(url, from: webView)
                return decisionHandler(.cancel)
            }
            decisionHandler(.allow)
        }

        // target="_blank" links and window.open().
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                if url.host == WebAppContainer.webAppURL.host { webView.load(URLRequest(url: url)) } else { openOutside(url, from: webView) }
            }
            return nil
        }

        private func openOutside(_ url: URL, from webView: WKWebView) {
            guard ["http", "https"].contains(url.scheme ?? ""), var top = webView.window?.rootViewController else {
                UIApplication.shared.open(url)
                return
            }
            while let presented = top.presentedViewController { top = presented }
            top.present(SFSafariViewController(url: url), animated: true)
        }

        private func refreshToken() {
            guard let webView else { return }
            Task {
                guard let token = await ClerkSession.token() else { return }
                let escaped = token.replacingOccurrences(of: "'", with: "\\'")
                await MainActor.run {
                    webView.evaluateJavaScript(
                        "window.__setMobileAuthToken && window.__setMobileAuthToken('\(escaped)');"
                    )
                }
            }
        }

        deinit {
            timer?.invalidate()
            if let pushObserver { NotificationCenter.default.removeObserver(pushObserver) }
        }
    }
}
