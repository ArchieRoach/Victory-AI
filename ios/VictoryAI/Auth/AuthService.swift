import Foundation

// MARK: - Response types

struct ValidateResponse: Codable {
    let accessGranted: Bool
    let subscriptionActive: Bool?
    let reason: String?

    enum CodingKeys: String, CodingKey {
        case accessGranted     = "access_granted"
        case subscriptionActive = "subscription_active"
        case reason
    }
}

// MARK: - Errors

enum AuthError: Error, LocalizedError {
    case noSession
    case tokenFetchFailed
    case networkError(Error)
    case serverError(Int, String?)
    case decodingError

    var errorDescription: String? {
        switch self {
        case .noSession:
            return "No active session. Please sign in again."
        case .tokenFetchFailed:
            return "Could not retrieve session token."
        case .networkError(let e):
            return e.localizedDescription
        case .serverError(let code, let detail):
            return detail ?? "Server error (\(code))."
        case .decodingError:
            return "Unexpected response from server."
        }
    }
}

// MARK: - AuthService

actor AuthService {
    static let shared = AuthService()

    private let backendURL: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "BACKEND_URL") as? String
            ?? "https://YOUR_RAILWAY_BACKEND_URL"
        return URL(string: raw.trimmingCharacters(in: .whitespaces) + "/api/auth/validate")!
    }()

    /// After an App Store purchase or restore: asks the server to re-read RevenueCat so Pro
    /// unlocks straight away (the webhook also does this, a moment later).
    func syncPurchases() async {
        guard let token = await ClerkSession.token() else { return }
        let url = backendURL.deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("subscription/revenuecat/sync")
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try? await URLSession.shared.data(for: request)
    }

    /// Call after Clerk sign-in completes.
    /// Returns a ValidateResponse; throws AuthError on failure.
    func validateAccess() async throws -> ValidateResponse {
        guard await ClerkSession.isSignedIn else {
            throw AuthError.noSession
        }
        guard let token = await ClerkSession.token() else {
            throw AuthError.tokenFetchFailed
        }

        var request = URLRequest(url: backendURL, timeoutInterval: 10)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json",  forHTTPHeaderField: "Content-Type")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw AuthError.networkError(error)
        }

        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            let detail = try? JSONDecoder().decode([String: String].self, from: data)["detail"]
            throw AuthError.serverError(http.statusCode, detail)
        }

        do {
            return try JSONDecoder().decode(ValidateResponse.self, from: data)
        } catch {
            throw AuthError.decodingError
        }
    }
}
