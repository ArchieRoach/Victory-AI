import Foundation

/// This week's training, handed from the web app (WidgetBridge) to the home screen widget
/// through the shared App Group. Only counts and a rank name: nothing personal.
struct WidgetSnapshot: Codable {
    var weekDays: Int
    var weekGoal: Int
    var streakWeeks: Int
    var trainedOn: String?
    var rank: String?
    var points: Int?
    var nextRank: String?
    var nextAt: Int?
    var weekStart: String
    var savedAt: Date

    static let key = "widget.snapshot"

    /// `group.<app bundle id>`, worked out the same way in the app and in the extension.
    static var groupID: String {
        var id = Bundle.main.bundleIdentifier ?? ""
        if id.hasSuffix(".widgets") { id = String(id.dropLast(".widgets".count)) }
        return "group.\(id)"
    }

    static func load() -> WidgetSnapshot? {
        guard let data = UserDefaults(suiteName: groupID)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        UserDefaults(suiteName: Self.groupID)?.set(data, forKey: Self.key)
    }

    static func clear() {
        UserDefaults(suiteName: groupID)?.removeObject(forKey: key)
    }

    /// Time moves on between app opens: a new week starts at zero, and "today" is only today.
    func daysThisWeek(now: Date = Date()) -> Int {
        weekStart == Self.day(Self.monday(of: now)) ? weekDays : 0
    }

    func trainedToday(now: Date = Date()) -> Bool {
        trainedOn == Self.day(now)
    }

    static func day(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    static func monday(of date: Date) -> Date {
        var cal = Calendar(identifier: .iso8601)
        cal.timeZone = .current
        return cal.dateInterval(of: .weekOfYear, for: date)?.start ?? date
    }
}
