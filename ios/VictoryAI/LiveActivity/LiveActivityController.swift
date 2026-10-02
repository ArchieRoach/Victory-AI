import ActivityKit
import Foundation

/// The round clock on the Lock Screen and Dynamic Island while training, plus the
/// push-to-start token the backend uses to start booking and callout countdowns.
@MainActor
final class LiveActivityController {
    static let shared = LiveActivityController()

    private var round: Activity<VictoryActivityAttributes>?
    private var observingTokens = false

    /// Activities only render when this build shipped the widget extension
    /// (ios/widgets.yml is included only once its signing profile exists).
    static var isSupported: Bool {
        guard let plugins = Bundle.main.builtInPlugInsURL else { return false }
        let ext = plugins.appendingPathComponent("VictoryWidgets.appex")
        return FileManager.default.fileExists(atPath: ext.path) && ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func updateRound(number: Int, total: Int, resting: Bool, endsAt: Date, paused: Bool, secondsLeft: Int) async {
        guard Self.isSupported else { return }
        let headline = resting ? "Rest · round \(min(number + 1, total)) next" : "Round \(number) of \(total)"
        let detail = paused ? "Paused" : (resting ? "Breathe. Hands up at the bell." : "Work.")
        let ends = paused ? Date().addingTimeInterval(TimeInterval(secondsLeft)) : endsAt
        let state = VictoryActivityAttributes.ContentState(headline: headline, detail: detail, endsAt: ends, paused: paused)
        let content = ActivityContent(state: state, staleDate: ends.addingTimeInterval(120))
        if let round {
            await round.update(content)
        } else {
            round = try? Activity<VictoryActivityAttributes>.request(
                attributes: VictoryActivityAttributes(kind: "round"), content: content, pushType: nil
            )
        }
    }

    func endRound() async {
        guard let round else { return }
        await round.end(nil, dismissalPolicy: .immediate)
        self.round = nil
    }

    func observePushToStartTokens(send: @escaping (String) async -> Void) {
        guard !observingTokens, Self.isSupported else { return }
        observingTokens = true
        if #available(iOS 17.2, *) {
            Task {
                for await data in Activity<VictoryActivityAttributes>.pushToStartTokenUpdates {
                    await send(data.map { String(format: "%02x", $0) }.joined())
                }
            }
        }
    }
}
