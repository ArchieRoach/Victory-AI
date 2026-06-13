import SwiftUI
import SafariServices

/// UIViewControllerRepresentable wrapper for SFSafariViewController.
/// Styled to match Victory AI's dark theme.
struct SafariBrowser: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        config.barCollapsingEnabled = true

        let vc = SFSafariViewController(url: url, configuration: config)
        // #12121A
        vc.preferredBarTintColor = UIColor(red: 0.071, green: 0.071, blue: 0.102, alpha: 1)
        // #E8FF47
        vc.preferredControlTintColor = UIColor(red: 0.910, green: 1.0, blue: 0.278, alpha: 1)
        vc.dismissButtonStyle = .done
        return vc
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
