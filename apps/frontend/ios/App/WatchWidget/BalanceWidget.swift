import WidgetKit
import SwiftUI
import BalanceKit

/// State source: shared App Group (``WatchSharedState``), not a direct API call.
///
/// The Watch app writes a ``WeekSnapshot`` there every time it refreshes its stats and immediately
/// asks WidgetKit to reload, so this widget reflects the week right away. The timeline's own
/// periodic refresh below is only a safety net for the case the app-triggered reload was missed
/// (e.g. this extension process was relaunched by the system) — it does not hit the network,
/// keeping the widget simple and reliable rather than depending on its own refresh budget.
struct BalanceEntry: TimelineEntry {
    let date: Date
    let snapshot: WeekSnapshot?
}

struct BalanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> BalanceEntry {
        BalanceEntry(
            date: Date(),
            snapshot: WeekSnapshot(
                categoryName: "Deep Work",
                categoryColor: "#3E7BB5",
                actualHours: 12,
                targetHours: 20,
                updatedAt: Date()
            )
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
            balanceView(snapshot)
        } else {
            idleView
        }
    }

    @ViewBuilder
    private var idleView: some View {
        switch family {
        case .accessoryCircular:
            Image(systemName: "calendar")
                .font(.title3)
        default:
            Text("No plan yet")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func balanceView(_ snapshot: WeekSnapshot) -> some View {
        let fraction = snapshot.targetHours > 0 ? min(snapshot.actualHours / snapshot.targetHours, 1) : 0
        let hours = "\(formatted(snapshot.actualHours))/\(formatted(snapshot.targetHours))h"

        switch family {
        case .accessoryCircular:
            Gauge(value: fraction) {
                Text(snapshot.categoryName.prefix(1))
            } currentValueLabel: {
                Text(formatted(snapshot.actualHours))
                    .minimumScaleFactor(0.6)
            }
            .gaugeStyle(.accessoryCircular)
            .tint(color(snapshot.categoryColor))
        case .accessoryInline:
            Label("\(snapshot.categoryName) \(hours)", systemImage: "scalemass")
        default:
            VStack(alignment: .leading, spacing: 2) {
                Text(snapshot.categoryName)
                    .font(.caption)
                    .lineLimit(1)
                ProgressView(value: fraction)
                    .tint(color(snapshot.categoryColor))
                Text(hours)
                    .font(.system(.caption2, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func formatted(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%.0f", value) : String(format: "%.1f", value)
    }

    private func color(_ hex: String) -> Color {
        let sanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        guard sanitized.count == 6, let value = UInt64(sanitized, radix: 16) else { return .accentColor }
        return Color(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

struct BalanceWidget: Widget {
    let kind: String = "BalanceWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceProvider()) { entry in
            BalanceWidgetView(entry: entry)
        }
        .configurationDisplayName("Balance")
        .description("Shows how this week is going against your plan.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
