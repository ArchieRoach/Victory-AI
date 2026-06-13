import SwiftUI
import ClerkSDK

/// Drop-in sign-in screen.
/// On success it calls AuthService to validate subscription before routing.
struct SignInView: View {
    @StateObject private var viewModel = SignInViewModel()
    @State private var emailAddress = ""
    @State private var password = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "#12121A").ignoresSafeArea()

                VStack(spacing: 24) {
                    // Logo / heading
                    Image("victory-logo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 100, height: 100)

                    Text("Victory AI")
                        .font(.largeTitle.bold())
                        .foregroundColor(.white)

                    Text("Sign in to continue your training")
                        .font(.subheadline)
                        .foregroundColor(Color(hex: "#8888A0"))

                    // Email / password fields
                    VStack(spacing: 12) {
                        TextField("Email", text: $emailAddress)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .textFieldStyle(VictoryFieldStyle())

                        SecureField("Password", text: $password)
                            .textFieldStyle(VictoryFieldStyle())
                    }

                    if let error = errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }

                    // Sign-in button
                    Button {
                        Task { await signIn() }
                    } label: {
                        ZStack {
                            if viewModel.isLoading {
                                ProgressView().tint(Color(hex: "#12121A"))
                            } else {
                                Text("Sign In")
                                    .font(.headline)
                                    .foregroundColor(Color(hex: "#12121A"))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color(hex: "#E8FF47"))
                        .cornerRadius(12)
                    }
                    .disabled(viewModel.isLoading)

                    // Social sign-in
                    HStack(spacing: 12) {
                        SocialSignInButton(provider: .google) {
                            Task { await signInWith(.google) }
                        }
                        SocialSignInButton(provider: .facebook) {
                            Task { await signInWith(.facebook) }
                        }
                    }
                }
                .padding(24)
            }
            // Route based on validation result
            .navigationDestination(item: $viewModel.destination) { dest in
                switch dest {
                case .app:
                    MainAppView()
                case .paywall(let reason):
                    PaywallView(reason: reason)
                case .error(let message):
                    AuthErrorView(message: message) {
                        viewModel.destination = nil
                    }
                }
            }
        }
    }

    // MARK: - Private

    private func signIn() async {
        errorMessage = nil
        viewModel.isLoading = true
        defer { viewModel.isLoading = false }

        do {
            let result = try await SignIn.create(strategy: .identifier(emailAddress, password: password))
            if result.status == .complete {
                await viewModel.handleSignInComplete()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func signInWith(_ provider: OAuthProvider) async {
        errorMessage = nil
        do {
            try await SignIn.authenticateWithRedirect(strategy: .oauth(provider))
            await viewModel.handleSignInComplete()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Supporting views

struct SocialSignInButton: View {
    let provider: OAuthProvider
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Image(provider == .google ? "ic_google" : "ic_facebook")
                    .resizable()
                    .frame(width: 20, height: 20)
                Text(provider == .google ? "Google" : "Facebook")
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(Color(hex: "#1E1E2E"))
            .cornerRadius(10)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: "#2A2A3A")))
        }
    }
}

struct VictoryFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(14)
            .background(Color(hex: "#0A0A0F"))
            .cornerRadius(10)
            .foregroundColor(.white)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: "#2A2A3A")))
    }
}

// Convenience hex colour init
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double(int         & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
