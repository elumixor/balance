import SwiftUI
import BalanceKit

/// What is coming, as a list.
///
/// The tracking screen has room for exactly one line about the calendar, which answers "what is
/// next" and nothing else — and the question a wrist actually asks halfway through a morning is
/// "what is the rest of today". This is that: everything still ahead in the fortnight the summary
/// covers, under a heading per day, drawn from the same summary the ring is drawn from so opening
/// it costs no request and works with no signal.
struct UpcomingView: View {
    let events: [NextEvent]
    let isStale: Bool

    var body: some View {
        List {
            if isStale {
                Text("Last known — no connection")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            }
            if events.isEmpty {
                Text("Nothing coming up")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            }
            ForEach(days, id: \.day) { group in
                Section(Self.heading(for: group.day)) {
                    ForEach(group.events) { event in
                        NavigationLink(value: event) {
                            UpcomingRow(event: event)
                        }
                    }
                }
            }
        }
        .navigationTitle("Upcoming")
        .navigationDestination(for: NextEvent.self) { EventDetailView(event: $0) }
    }

    /// The events split into the days they start on, in order. A day heading is what makes a list
    /// like this readable at a glance — the alternative is every row carrying a date nobody reads.
    private var days: [(day: Date, events: [NextEvent])] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: events) { calendar.startOfDay(for: $0.start) }
        return grouped.keys.sorted().map { (day: $0, events: grouped[$0]?.sorted { $0.start < $1.start } ?? []) }
    }

    /// "Today" and "Tomorrow" before anything else, because those are the two days anybody is
    /// actually looking for; the rest say their weekday, which is how a week is talked about.
    private static func heading(for day: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(day) { return "Today" }
        if calendar.isDateInTomorrow(day) { return "Tomorrow" }
        return day.formatted(.dateTime.weekday(.wide))
    }
}

/// One line: when it is, what it is, and what it counts towards. The bar down the left is the
/// category's colour — the same thing the ring is made of, so a glance says which part of the week
/// this hour belongs to without a word being read.
private struct UpcomingRow: View {
    let event: NextEvent

    var body: some View {
        HStack(spacing: 8) {
            Capsule()
                .fill(tint)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                Text(event.title)
                    .font(.caption)
                    .lineLimit(2)
                HStack(spacing: 4) {
                    Image(systemName: glyph)
                        .font(.system(size: 9))
                    Text(when)
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }

    private var when: String {
        if event.inProgress { return "now · until \(event.end.formatted(date: .omitted, time: .shortened))" }
        return event.start.formatted(date: .omitted, time: .shortened)
    }

    private var glyph: String {
        guard let icon = event.categoryIcon else { return event.inProgress ? "record.circle" : "calendar" }
        return Icons.symbol(for: icon)
    }

    private var tint: Color {
        event.categoryColor.map { Color(hex: $0) } ?? .gray
    }
}

/// One event, with the only thing a watch can usefully do about it: run its timer.
///
/// The timer is the event's own — it runs against the block already on the calendar rather than
/// writing a second one beside it — so this is the same act as the "start timer" on the reminder,
/// and it works with no signal the same way, by running on the wrist and telling the calendar when
/// there is something to tell.
struct EventDetailView: View {
    let event: NextEvent

    @Environment(\.dismiss) private var dismiss
    @State private var sessions = SessionController.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(event.title)
                    .font(.headline)
                    .lineLimit(4)

                Label(span, systemImage: "clock")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if let name = event.categoryName {
                    Label(name, systemImage: Icons.symbol(for: event.categoryIcon ?? ""))
                        .font(.caption2)
                        .foregroundStyle(event.categoryColor.map { Color(hex: $0) } ?? .secondary)
                }

                if event.categoryId == nil {
                    // Honest rather than a button that would fail: an unmapped block has no sphere
                    // for the hour to land in, and choosing one is a phone-sized decision.
                    Text("Not counted towards a sphere yet — say what it is for in Balance to time it.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    Button {
                        Task {
                            await sessions.start(for: event)
                            dismiss()
                        }
                    } label: {
                        Label("Start timer", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(sessions.isBusy)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle(event.inProgress ? "Now" : "Next")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var span: String {
        let start = event.start.formatted(date: .omitted, time: .shortened)
        let end = event.end.formatted(date: .omitted, time: .shortened)
        return "\(start) – \(end)"
    }
}
