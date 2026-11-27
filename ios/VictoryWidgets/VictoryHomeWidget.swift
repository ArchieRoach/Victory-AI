import SwiftUI
import WidgetKit

// Goal: fighters come back on the days they meant to train (retention).
// Psychology: a cue in plain sight starts the habit (Fogg: prompts), visible progress pulls you
//   to finish what you started (goal gradient), and a streak you can see is one you protect.
// Design: this week's training days as dots, the weekly streak, and the season rank on the
//   home and lock screen. Every tap opens straight to a round. It only shows real numbers the
//   app saved; with nothing saved it simply invites a first round.

private let widgetLime = Color(red: 0.91, green: 1.0, blue: 0.28)
private let widgetNight = Color(red: 0.04, green: 0.04, blue: 0.06)
private let widgetMuted = Color.white.opacity(0.6)

struct WeekEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct WeekProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeekEntry {
        WeekEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (WeekEntry) -> Void) {
        completion(WeekEntry(date: Date(), snapshot: WidgetSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WeekEntry>) -> Void) {
        let now = Date()
        let cal = Calendar.current
        let midnight = cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: now) ?? now)
        var entries = [WeekEntry(date: now, snapshot: WidgetSnapshot.load())]
        // A second look in the evening, when "still time today" matters most.
        if let evening = cal.date(bySettingHour: 18, minute: 0, second: 0, of: now), evening > now {
            entries.append(WeekEntry(date: evening, snapshot: WidgetSnapshot.load()))
        }
        completion(Timeline(entries: entries, policy: .after(midnight)))
    }
}

private func trainURL() -> URL? {
    var id = Bundle.main.bundleIdentifier ?? ""
    if id.hasSuffix(".widgets") { id = String(id.dropLast(".widgets".count)) }
    return URL(string: "\(id)://open/train")
}

private struct WeekDots: View {
    let done: Int
    let goal: Int

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<min(goal, 7), id: \.self) { i in
                Circle()
                    .fill(i < done ? widgetLime : Color.white.opacity(0.18))
                    .frame(width: 10, height: 10)
            }
        }
        .accessibilityLabel("\(done) of \(goal) training days this week")
    }
}

private struct WeekSummary: View {
    let entry: WeekEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("VICTORY AI")
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.5)
                .foregroundStyle(widgetLime)
            if let s = entry.snapshot {
                let days = s.daysThisWeek(now: entry.date)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Image(systemName: "flame.fill").foregroundStyle(.orange)
                    Text("\(s.streakWeeks)")
                        .font(.system(size: 30, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                    Text(s.streakWeeks == 1 ? "week" : "weeks")
                        .font(.caption2)
                        .foregroundStyle(widgetMuted)
                }
                WeekDots(done: days, goal: s.weekGoal)
                Spacer(minLength: 0)
                Text(callToAction(s, days: days))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(s.trainedToday(now: entry.date) ? widgetMuted : widgetLime)
                    .lineLimit(2)
            } else {
                Spacer(minLength: 0)
                Image(systemName: "figure.boxing")
                    .font(.title)
                    .foregroundStyle(widgetLime)
                Text("Tap to start a round")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func callToAction(_ s: WidgetSnapshot, days: Int) -> String {
        if s.trainedToday(now: entry.date) { return "Done today ✓" }
        if days >= s.weekGoal { return "Week done. Bonus round?" }
        let left = s.weekGoal - days
        let evening = Calendar.current.component(.hour, from: entry.date) >= 18
        if evening { return "Still time today" }
        return "\(left) more this week"
    }
}

private struct SeasonPanel: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("SEASON")
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.5)
                .foregroundStyle(widgetMuted)
            Text(snapshot.rank ?? "Unranked")
                .font(.title3.weight(.heavy))
                .foregroundStyle(.white)
            if let points = snapshot.points, let next = snapshot.nextAt, next > 0 {
                ProgressView(value: Double(min(points, next)), total: Double(next))
                    .tint(widgetLime)
                if let nextRank = snapshot.nextRank {
                    Text("\(max(0, next - points)) to \(nextRank)")
                        .font(.caption2)
                        .foregroundStyle(widgetMuted)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct VictoryHomeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WeekEntry

    var body: some View {
        content
            .widgetURL(trainURL())
            .containerBackground(for: .widget) {
                if family == .systemSmall || family == .systemMedium { widgetNight } else { Color.clear }
            }
    }

    @ViewBuilder private var content: some View {
        let s = entry.snapshot
        let days = s?.daysThisWeek(now: entry.date) ?? 0
        let goal = s?.weekGoal ?? 3
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(min(days, goal)), in: 0...Double(goal)) {
                Image(systemName: "figure.boxing")
            } currentValueLabel: {
                Text("\(days)")
            }
            .gaugeStyle(.accessoryCircular)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label(s.map { "\($0.streakWeeks)-week streak" } ?? "Victory AI", systemImage: "flame.fill")
                    .font(.headline)
                Text(s == nil ? "Tap to start a round" : "\(days) of \(goal) days this week")
                    .font(.caption)
            }
        case .accessoryInline:
            Text(s == nil ? "Start a round" : "\(days)/\(goal) days · \(s?.streakWeeks ?? 0)-wk streak")
        case .systemMedium:
            HStack(spacing: 16) {
                WeekSummary(entry: entry)
                if let s {
                    SeasonPanel(snapshot: s)
                }
            }
        default:
            WeekSummary(entry: entry)
        }
    }
}

struct VictoryHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VictoryWeek", provider: WeekProvider()) { entry in
            VictoryHomeWidgetView(entry: entry)
        }
        .configurationDisplayName("Your week")
        .description("Your training days, streak and season rank. Tap to start a round.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
