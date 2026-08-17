import BalanceKit
import SwiftUI
import WidgetKit

/// State source: the shared App Group (``WatchSharedState``), never a direct API call.
///
/// The Watch app writes a ``WatchSnapshot`` there every time it refreshes — the week's categories,
/// the next calendar event and the running session — and immediately asks WidgetKit to reload, so
/// this widget shows what the app last saw without paying for its own network call, its own auth,
/// or its own failure modes. The timeline's periodic refresh below is only a safety net for when
/// that app-triggered reload was missed (this extension having been relaunched by the system, say).
struct BalanceEntry: TimelineEntry {
    let date: Date
    let snapshot: WatchSnapshot?
}

struct BalanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> BalanceEntry {
        BalanceEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (BalanceEntry) -> Void) {
        let snapshot: WatchSnapshot? = context.isPreview ? .placeholder : WatchSharedState.load()
        completion(BalanceEntry(date: Date(), snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BalanceEntry>) -> Void) {
        let now = Date()
        let snapshot = WatchSharedState.load()

        // Everything that ticks — the elapsed timer, the countdown, "in 5 min" — is rendered by
        // SwiftUI's own live text, so a single entry carries the whole visible period. The dates we
        // do schedule are the moments the *wording* changes: an event that starts (so it stops
        // reading "in 5 min") and a fixed session that runs out (so it stops reading as running).
        var dates: [Date] = [now]
        if let start = snapshot?.nextEvent?.start, start > now {
            dates.append(start)
        }
        if let end = snapshot?.active?.plannedEndAt, end > now {
            dates.append(end)
        }

        let entries = dates.sorted().map { BalanceEntry(date: $0, snapshot: snapshot) }
        let safetyNet = now.addingTimeInterval(15 * 60)
        let reload = max(dates.last ?? safetyNet, safetyNet)
        completion(Timeline(entries: entries, policy: .after(reload)))
    }
}

extension WatchSnapshot {
    /// What the gallery and the placeholder redaction render before any real snapshot exists.
    static let placeholder = WatchSnapshot(
        categories: [
            SnapshotCategory(
                id: "work", name: "Deep Work", color: "#3E7BB5", icon: "brain",
                targetHours: 20, actualHours: 12
            ),
            SnapshotCategory(
                id: "body", name: "Body", color: "#5FA97C", icon: "dumbbell",
                targetHours: 6, actualHours: 4
            ),
            SnapshotCategory(
                id: "rest", name: "Rest", color: "#B57A3E", icon: "moon",
                targetHours: 10, actualHours: 3
            ),
        ],
        nextEvent: SnapshotEvent(title: "Standup", start: Date().addingTimeInterval(5 * 60)),
        active: nil,
        updatedAt: Date()
    )
}

/// The week drawn as a ring: each category takes the share of the circle its planned hours claim,
/// and the hours spent fill that share from the inside of the band outward, so a segment reads as
/// how deep it has got rather than how far around. The same dial the app and the web use, shrunk to
/// the one place a complication has for it.
struct CategoryDial: View {
    let categories: [SnapshotCategory]
    var lineWidth: CGFloat = 5

    /// Angular breathing room between neighbours, as a fraction of the full circle.
    private let gap = 0.014

    /// The shares come from ``DialLayout``, the same maths the watch app's wheel is built from, so
    /// the complication and the app never draw the same week two different ways.
    private var segments: [DialSegment<SnapshotCategory>] {
        DialLayout(categories: categories).segments
    }

    var body: some View {
        ZStack {
            ForEach(segments) { segment in
                let drawn = max(segment.span - gap, 0.005)
                let fill = segment.category.dialFill
                let filledWidth = lineWidth * fill
                let color = Color(hex: segment.category.color)

                arc(from: segment.start, length: drawn)
                    .stroke(color.opacity(0.25), style: .init(lineWidth: lineWidth, lineCap: .round))
                if fill > 0 {
                    // A stroke straddles the circle it is drawn on, so pulling the radius inward by
                    // half the width the band has lost keeps the filled part sitting on the inner
                    // edge of the track and growing toward the rim.
                    arc(from: segment.start, length: drawn, inset: (lineWidth - filledWidth) / 2)
                        .stroke(color, style: .init(lineWidth: filledWidth, lineCap: .round))
                }
            }
        }
        .rotationEffect(.degrees(-90))
        .padding(lineWidth / 2)
    }

    private func arc(from start: Double, length: Double, inset: CGFloat = 0) -> some Shape {
        Circle().inset(by: inset).trim(from: start, to: start + length)
    }
}

struct BalanceWidgetView: View {
    var entry: BalanceProvider.Entry
    @Environment(\.widgetFamily) private var family

    private var active: SnapshotSession? { entry.snapshot?.active }
    private var upcoming: SnapshotEvent? { entry.snapshot?.nextEvent }

    var body: some View {
        content
            .widgetURL(URL(string: "balance://track"))
            .containerBackground(.clear, for: .widget)
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCircular: circular
        case .accessoryCorner: corner
        case .accessoryInline: inline
        default: rectangular
        }
    }

    // MARK: - Circular

    @ViewBuilder
    private var circular: some View {
        if let session = active {
            if let end = session.plannedEndAt, end > entry.date {
                ProgressView(timerInterval: session.startedAt...end, countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    Image(systemName: Icons.symbol(for: session.categoryIcon))
                        .font(.system(size: 14))
                }
                .progressViewStyle(.circular)
                .tint(Color(hex: session.categoryColor))
            } else {
                ZStack {
                    Circle()
                        .stroke(Color(hex: session.categoryColor).opacity(0.35), lineWidth: 5)
                        .padding(2.5)
                    VStack(spacing: 0) {
                        Image(systemName: Icons.symbol(for: session.categoryIcon))
                            .font(.system(size: 11))
                        Text(session.startedAt, style: .timer)
                            .font(.system(size: 11, design: .rounded))
                            .monospacedDigit()
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 6)
                }
            }
        } else if let snapshot = entry.snapshot, !snapshot.categories.isEmpty {
            ZStack {
                CategoryDial(categories: snapshot.categories)
                if let event = upcoming {
                    minutesUntil(event.start)
                        .font(.system(size: 13, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                        .padding(.horizontal, 9)
                } else {
                    Image(systemName: "scalemass")
                        .font(.system(size: 13))
                }
            }
        } else {
            Image(systemName: "scalemass")
                .font(.title3)
        }
    }

    // MARK: - Corner

    @ViewBuilder
    private var corner: some View {
        if let session = active {
            Image(systemName: Icons.symbol(for: session.categoryIcon))
                .font(.title2)
                .widgetLabel { timerLabel(session) }
        } else if let event = upcoming {
            Image(systemName: "calendar")
                .font(.title2)
                .widgetLabel { Text(event.title) }
        } else if let category = entry.snapshot?.mostBehind {
            Image(systemName: Icons.symbol(for: category.icon))
                .font(.title2)
                .widgetLabel {
                    Gauge(value: min(max(category.ratio, 0), 1)) { Text(category.name) }
                        .tint(Color(hex: category.color))
                }
        } else {
            Image(systemName: "scalemass")
                .font(.title2)
                .widgetLabel { Text("Balance") }
        }
    }

    // MARK: - Inline

    @ViewBuilder
    private var inline: some View {
        if let session = active {
            Label {
                Text("\(session.categoryName) ") + timerLabel(session)
            } icon: {
                Image(systemName: Icons.symbol(for: session.categoryIcon))
            }
        } else if let event = upcoming {
            Label {
                Text("\(event.title) · ") + relative(event.start)
            } icon: {
                Image(systemName: "calendar")
            }
        } else if let category = entry.snapshot?.mostBehind {
            Label("\(category.name) \(hours(category))", systemImage: "scalemass")
        } else {
            Label("Balance", systemImage: "scalemass")
        }
    }

    // MARK: - Rectangular

    @ViewBuilder
    private var rectangular: some View {
        if let session = active {
            VStack(alignment: .leading, spacing: 1) {
                Label(session.categoryName, systemImage: Icons.symbol(for: session.categoryIcon))
                    .font(.caption)
                    .lineLimit(1)
                    .foregroundStyle(Color(hex: session.categoryColor))
                timerLabel(session)
                    .font(.system(.title3, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if session.plannedEndAt != nil {
                    Text("left")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else if let event = upcoming {
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(.headline)
                    .lineLimit(2)
                relative(event.start)
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else if let category = entry.snapshot?.mostBehind {
            VStack(alignment: .leading, spacing: 2) {
                Label(category.name, systemImage: Icons.symbol(for: category.icon))
                    .font(.caption)
                    .lineLimit(1)
                ProgressView(value: min(max(category.ratio, 0), 1))
                    .tint(Color(hex: category.color))
                Text(hours(category))
                    .font(.system(.caption2, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text("No plan yet")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Pieces

    /// Counts down for a fixed session that still has time left, and counts up otherwise — both
    /// rendered by SwiftUI itself, so they keep ticking between timeline reloads.
    private func timerLabel(_ session: SnapshotSession) -> Text {
        if let end = session.plannedEndAt, end > entry.date {
            return Text(timerInterval: entry.date...end, countsDown: true)
        }
        return Text(session.startedAt, style: .timer)
    }

    /// The menu bar's phrasing: "in 5 min" until it starts, then simply "now".
    private func relative(_ date: Date) -> Text {
        date <= entry.date ? Text("now") : Text("in ") + Text(date, style: .relative)
    }

    /// The same countdown with no room for the word "in".
    private func minutesUntil(_ date: Date) -> Text {
        date <= entry.date ? Text("now") : Text(date, style: .relative)
    }

    private func hours(_ category: SnapshotCategory) -> String {
        "\(hoursText(category.actualHours))/\(hoursText(category.targetHours))h"
    }
}

struct BalanceWidget: Widget {
    let kind: String = "BalanceWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceProvider()) { entry in
            BalanceWidgetView(entry: entry)
        }
        .configurationDisplayName("Balance")
        .description("What's next, what's running, and how the week is going.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline])
    }
}
