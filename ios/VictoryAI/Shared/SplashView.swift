import SwiftUI

/// Shown while AppRouter is re-validating the session on launch.
struct SplashView: View {
    var body: some View {
        ZStack {
            Color(hex: "#12121A").ignoresSafeArea()
            VStack(spacing: 24) {
                Image("victory-logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 100, height: 100)
                ProgressView()
                    .tint(Color(hex: "#E8FF47"))
            }
        }
    }
}
