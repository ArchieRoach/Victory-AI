import SwiftUI

struct AuthErrorView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        ZStack {
            Color(hex: "#12121A").ignoresSafeArea()
            VStack(spacing: 20) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.red)
                Text("Something went wrong")
                    .font(.title2.bold())
                    .foregroundColor(.white)
                Text(message)
                    .font(.subheadline)
                    .foregroundColor(Color(hex: "#8888A0"))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                Button("Try Again", action: onRetry)
                    .font(.headline)
                    .foregroundColor(Color(hex: "#12121A"))
                    .frame(width: 160, height: 48)
                    .background(Color(hex: "#E8FF47"))
                    .cornerRadius(12)
            }
        }
    }
}
