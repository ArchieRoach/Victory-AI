import ActivityKit
import SwiftUI
import WidgetKit

@main
struct VictoryWidgetsBundle: WidgetBundle {
    var body: some Widget {
        VictoryLiveActivity()
    }
}

private let lime = Color(red: 0.91, green: 1.0, blue: 0.28)
private let night = Color(red: 0.04, green: 0.04, blue: 0.06)

private func icon(_ kind: String) -> String {
    switch kind {
    case "callout": return "megaphone.fill"
    case "booking": return "calendar.badge.clock"
    default: return "figure.boxing"
    }
}

private struct Countdown: View {
    let state: VictoryActivityAttributes.ContentState

    var body: some View {
        if state.paused {
            Text("Paused")
        } else {
            Text(timerInterval: Date()...max(Date(), state.endsAt), countsDown: true)
                .monospacedDigit()
        }
    }
}

struct VictoryLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: VictoryActivityAttributes.self) { context in
            HStack(spacing: 14) {
                Image(systemName: icon(context.attributes.kind))
                    .font(.title2)
                    .foregroundStyle(lime)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.headline)
                        .font(.headline)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(context.state.detail)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.65))
                        .lineLimit(1)
                }
                Spacer()
                Countdown(state: context.state)
                    .font(.title.bold())
                    .foregroundStyle(lime)
                    .frame(maxWidth: 110, alignment: .trailing)
            }
            .padding(16)
            .activityBackgroundTint(night)
            .activitySystemActionForegroundColor(lime)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: icon(context.attributes.kind))
                        .font(.title2)
                        .foregroundStyle(lime)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state)
                        .font(.title2.bold())
                        .foregroundStyle(lime)
                        .frame(maxWidth: 100, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.headline).font(.headline).lineLimit(1)
                        Text(context.state.detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: icon(context.attributes.kind))
                    .foregroundStyle(lime)
            } compactTrailing: {
                Countdown(state: context.state)
                    .frame(maxWidth: 56)
                    .foregroundStyle(lime)
            } minimal: {
                Image(systemName: icon(context.attributes.kind))
                    .foregroundStyle(lime)
            }
        }
    }
}
