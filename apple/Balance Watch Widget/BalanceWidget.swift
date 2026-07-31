import WidgetKit
import SwiftUI
import BalanceKit

/// State source: shared App Group (``WatchSharedState``), not a direct API call.
///
/// The Watch app writes a ``TrackingSnapshot`` there every time it starts/stops a timer and
/// immediately asks WidgetKit to reload, so this widget reflects state changes right away. The
/// timeline's own periodic refresh below is only a safety net for the case the app-triggered
/// reload was missed (e.g. this extension process was relaunched by the system) — it does not
/// hit the network, keeping the widget simple and reliable rather than depending on its own
/// refresh budget for freshness.
struct BalanceEntry: TimelineEntry {
    let date: Date
    let snapshot: TrackingSnapshot?
}

struct BalanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> BalanceEntry {
        BalanceEntry(
            date: Date(),
            snapshot: TrackingSnapshot(activityId: "preview", activityName: "Deep Work", startedAt: Date().addingTimeInterval(-1800))
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (BalanceEntry) -> Void) {
        completion(BalanceEntry(date: Date(), snapshot: WatchSharedState.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BalanceEntry>) -> Void) {
        let entry = BalanceEntry(date: Date(), snapshot: WatchSharedState.load())
        let nextRefresh = Date().addingTimeInterval(15 * 60)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

struct BalanceWidgetView: View {
    var entry: BalanceProvider.Entry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if let snapshot = entry.snapshot {
            trackingView(snapshot)
        } else {
            idleView
        }
    }

    @ViewBuilder
    private var idleView: some View {
        switch family {
        case .accessoryCircular:
            Image(systemName: "moon.zzz")
                .font(.title3)
        default:
            Text("Not tracking")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func trackingView(_ snapshot: TrackingSnapshot) -> some View {
        // A far-future upper bound with countsDown: false renders as a live-updating elapsed
        // (count-up) timer — the system, not this extension, keeps it ticking every second.
        let range = snapshot.startedAt...snapshot.startedAt.addingTimeInterval(24 * 60 * 60)
        switch family {
        case .accessoryCircular:
            VStack(spacing: 1) {
                Image(systemName: "timer")
                    .font(.caption2)
                Text(timerInterval: range, countsDown: false, showsHours: false)
                    .font(.system(size: 13, weight: .semibold))
                    .minimumScaleFactor(0.6)
            }
        case .accessoryInline:
            Label {
                Text(timerInterval: range, countsDown: false)
            } icon: {
                Image(systemName: "timer")
            }
        default:
            VStack(alignment: .leading, spacing: 2) {
                Text(snapshot.activityName)
                    .font(.caption)
                    .lineLimit(1)
                Text(timerInterval: range, countsDown: false)
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .monospacedDigit()
            }
        }
    }
}

struct BalanceWidget: Widget {
    let kind: String = "BalanceWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceProvider()) { entry in
            BalanceWidgetView(entry: entry)
        }
        .configurationDisplayName("Balance")
        .description("Shows what you're currently tracking.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
