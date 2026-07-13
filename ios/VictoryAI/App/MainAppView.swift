import SwiftUI
import WebKit
import ClerkSDK

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

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: Self.webAppURL))
        context.coordinator.startTokenRefresh(for: webView)
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

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            refreshToken()
        }

        private func refreshToken() {
            guard let webView else { return }
            Task {
                guard let session = await Clerk.shared.session,
                      let token = try? await session.getToken() else { return }
                let escaped = token.replacingOccurrences(of: "'", with: "\\'")
                await MainActor.run {
                    webView.evaluateJavaScript(
                        "window.__setMobileAuthToken && window.__setMobileAuthToken('\(escaped)');"
                    )
                }
            }
        }

        deinit { timer?.invalidate() }
    }
}
