import AppIntents

/// "Hey Siri, start a round in Victory AI" — the shortest path from the urge to train to
/// the round timer. Also shows up in Spotlight and the Shortcuts app with no setup.
struct StartRoundIntent: AppIntent {
    static var title: LocalizedStringResource = "Start a round"
    static var description = IntentDescription("Opens Victory AI straight to the round timer.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        PushNotificationManager.shared.open(path: "/train")
        return .result()
    }
}

struct OpenCalloutsIntent: AppIntent {
    static var title: LocalizedStringResource = "Check my callouts"
    static var description = IntentDescription("Shows who's called you out and how long is left.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        PushNotificationManager.shared.open(path: "/callouts")
        return .result()
    }
}

struct VictoryShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartRoundIntent(),
            phrases: ["Start a round in \(.applicationName)", "Start boxing with \(.applicationName)"],
            shortTitle: "Start a round",
            systemImageName: "figure.boxing"
        )
        AppShortcut(
            intent: OpenCalloutsIntent(),
            phrases: ["Check my callouts in \(.applicationName)"],
            shortTitle: "Callouts",
            systemImageName: "megaphone"
        )
    }
}
