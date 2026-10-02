import ActivityKit
import Foundation

/// Shared by the app (which starts and updates activities) and the VictoryWidgets
/// extension (which draws them). The backend's push-to-start payload uses these exact
/// field names — see `live_activity_payload` in backend/server.py.
struct VictoryActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var headline: String
        var detail: String
        var endsAt: Date
        var paused: Bool
    }

    /// "round", "booking" or "callout".
    var kind: String
}
