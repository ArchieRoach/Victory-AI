import SwiftUI

/// Shown when the Railway backend is unreachable.
/// Never permanently locks the user out — always provides a retry path.
struct NetworkErrorView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        ZStack {
            Color(hex: "#12121A").ignoresSafeArea()

            VStack(spacing: 28) {
                ZStack {
                    Circle()
                        .fill(Color.red.opacity(0.10))
                        .frame(width: 96, height: 96)
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 38, weight: .semibold))
                        .foregroundColor(.red)
                }

                VStack(spacing: 10) {
                    Text("No Connection")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.white)

                    Text(message)
                        .font(.subheadline)
                        .foregroundColor(Color(hex: "#8888A0"))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 44)
                }

                Button(action: onRetry) {
                    Text("Try Again")
                        .font(.headline)
                        .foregroundColor(Color(hex: "#12121A"))
                        .frame(width: 200, height: 52)
                        .background(Color(hex: "#E8FF47"))
                        .cornerRadius(14)
                }
            }
        }
    }
}
