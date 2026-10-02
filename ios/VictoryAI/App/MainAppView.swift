import SwiftUI
import WebKit

/// Hosts the existing Victory AI web app (React, deployed on Vercel) inside the
/// native shell. Only Auth/Paywall/Splash/NetworkError are truly native —
/// everything past sign-in reuses the same web codebase, kept authenticated
/// via a Clerk token bridge (see `window.__setMobileAuthToken` in
/// frontend/src/App.js).
struct MainAppView: View {
    var body: some View {
        WebAppContainer()
            .ignoresSafeArea(edges: .bottom)
    }
}

private struct WebAppContainer: UIViewRepresentable {
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
        config.userContentController.addScriptMessageHandler(
            PushBridge(allowedHost: Self.webAppURL.host), contentWorld: .page, name: PushBridge.name
        )

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
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
    final class Coordinator: NSObject, WKNavigationDelegate {
        private weak var webView: WKWebView?
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
            refreshToken()
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
