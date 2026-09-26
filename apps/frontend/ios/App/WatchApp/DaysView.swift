import SwiftUI
import BalanceKit

/// The calendar, a day at a time.
///
/// One page per day, stacked vertically, so the crown does what it does everywhere on the watch:
/// it scrolls the day's events and, past the last one, turns to the next day. The stack has no end
/// either way — it grows as the crown nears an edge — because "what did I have on Tuesday" and
/// "what is on next Friday" are the same question.
///
/// The pages are fetched a week at a time and kept for as long as the screen is open. Out of range,
/// the days the summary already covers are drawn from it, and the rest say so.
struct DaysView: View {
    /// What the summary already knows, so the first page is drawn before any request lands and a
    /// wrist with no signal still has the fortnight ahead.
    let seed: [NextEvent]

    @Environment(WatchRouter.self) private var router
    @State private var model = DayEventsModel()
    @State private var selection = 0
    @State private var range = -Self.growBy...Self.growBy * 2

    /// How many days the stack grows by when the crown gets close to an edge.
    private static let growBy = 14
    private static let edgeMargin = 3

    var body: some View {
        TabView(selection: $selection) {
            ForEach(Array(range), id: \.self) { offset in
                DayPage(
                    day: model.day(at: offset),
                    events: model.events(at: offset),
                    state: model.state(at: offset)
                )
                .tag(offset)
            }
        }
        .tabViewStyle(.verticalPage)
        .navigationTitle(DayPage.heading(for: model.day(at: selection)))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    router.path = NavigationPath()
                } label: {
                    Image(systemName: "timer")
                }
            }
            if selection != 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        withAnimation { selection = 0 }
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                    }
                }
            }
        }
        .navigationDestination(for: NextEvent.self) { EventDetailView(event: $0) }
        .onAppear { model.seed(seed) }
        .task(id: selection) {
            grow(around: selection)
            await model.load(around: selection)
        }
    }

    private func grow(around offset: Int) {
        if offset - range.lowerBound < Self.edgeMargin {
            range = (range.lowerBound - Self.growBy)...range.upperBound
        }
        if range.upperBound - offset < Self.edgeMargin {
            range = range.lowerBound...(range.upperBound + Self.growBy)
        }
    }
}

/// Where each day's events come from: a week per request, cached by the day's own midnight.
@MainActor
@Observable
final class DayEventsModel {
    enum State { case loading, loaded, offline, failed }

    private var byDay: [Date: [NextEvent]] = [:]
    private var loadedWeeks: Set<Int> = []
    private var weekStates: [Int: State] = [:]
    private let today = Calendar.current.startOfDay(for: .now)

    private static let daysPerWeek = 7

    func day(at offset: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: offset, to: today) ?? today
    }

    func events(at offset: Int) -> [NextEvent] {
        byDay[day(at: offset)] ?? []
    }

    func state(at offset: Int) -> State {
        let week = Self.week(of: offset)
        if loadedWeeks.contains(week) { return .loaded }
        return weekStates[week] ?? .loading
    }

    /// The summary's events, drawn until the real answer for their week arrives. An event that
    /// runs past midnight is filed under the day it starts, as every calendar does.
    func seed(_ events: [NextEvent]) {
        guard byDay.isEmpty else { return }
        let calendar = Calendar.current
        byDay = Dictionary(grouping: events) { calendar.startOfDay(for: $0.start) }
    }

    /// The week holding `offset`, and the one beside it the crown is heading towards, so turning
    /// the page past a week's edge rarely waits.
    func load(around offset: Int) async {
        let week = Self.week(of: offset)
        let dayInWeek = offset - week * Self.daysPerWeek
        let neighbour = dayInWeek < Self.daysPerWeek / 2 ? week - 1 : week + 1
        await load(week: week)
        await load(week: neighbour)
    }

    private func load(week: Int) async {
        guard !loadedWeeks.contains(week), weekStates[week] != .loading else { return }
        if WatchPreview.isEnabled {
            loadedWeeks.insert(week)
            return
        }
        weekStates[week] = .loading
        let from = day(at: week * Self.daysPerWeek)
        let to = day(at: (week + 1) * Self.daysPerWeek)
        do {
            let answer = try await APIClient.shared.fetchDays(from: from, to: to)
            let calendar = Calendar.current
            let grouped = Dictionary(grouping: answer.events) { calendar.startOfDay(for: $0.start) }
            for offset in 0..<Self.daysPerWeek {
                let date = day(at: week * Self.daysPerWeek + offset)
                byDay[date] = grouped[date] ?? []
            }
            loadedWeeks.insert(week)
            weekStates[week] = .loaded
        } catch {
            weekStates[week] = isOfflineFailure(error) ? .offline : .failed
        }
    }

    /// Weeks counted from today, not from Monday: the pager starts on today and a week is just the
    /// unit it asks in.
    private static func week(of offset: Int) -> Int {
        Int((Double(offset) / Double(daysPerWeek)).rounded(.down))
    }
}

/// One day: its name, then its events, then nothing — the crown carries on to the next page.
private struct DayPage: View {
    let day: Date
    let events: [NextEvent]
    let state: DayEventsModel.State

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if events.isEmpty {
                    Text(emptyText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.top, 8)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(events) { event in
                        NavigationLink(value: event) {
                            EventRow(event: event)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
        }
    }

    private var emptyText: String {
        switch state {
        case .loading: return "…"
        case .loaded: return "Nothing planned"
        case .offline: return "No connection"
        case .failed: return "Couldn't load this day"
        }
    }

    /// "Today", "Tomorrow" and "Yesterday" before anything else, because those are the days anybody
    /// is actually looking for; the rest say their weekday, which is how a week is talked about.
    static func heading(for day: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(day) { return "Today" }
        if calendar.isDateInTomorrow(day) { return "Tomorrow" }
        if calendar.isDateInYesterday(day) { return "Yesterday" }
        return day.formatted(.dateTime.weekday(.wide))
    }
}

/// One line: when it is, what it is, and what it counts towards. The bar down the left is the
/// category's colour — the same thing the ring is made of, so a glance says which part of the week
/// this hour belongs to without a word being read. What is over is dimmed.
private struct EventRow: View {
    let event: NextEvent

    var body: some View {
        TimelineView(.everyMinute) { context in
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
                        Text(when(now: context.date))
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 6)
            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
            .opacity(event.end <= context.date ? 0.5 : 1)
        }
    }

    private func when(now: Date) -> String {
        let start = event.start.formatted(date: .omitted, time: .shortened)
        let end = event.end.formatted(date: .omitted, time: .shortened)
        if event.start <= now, event.end > now { return "now · until \(end)" }
        return "\(start) – \(end)"
    }

    private var glyph: String {
        guard let icon = event.categoryIcon else { return "calendar" }
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

    @Environment(WatchRouter.self) private var router
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

                if event.end <= .now {
                    // Nothing to time: it is over, and what it came to is already in the week.
                    EmptyView()
                } else if event.categoryId == nil {
                    // Honest rather than a button that would fail: an unmapped block has no sphere
                    // for the hour to land in, and choosing one is a phone-sized decision.
                    Text("Not counted towards a sphere yet — say what it is for in Balance to time it.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    Button {
                        Task {
                            await sessions.start(for: event)
                            router.path = NavigationPath()
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
        .navigationBarTitleDisplayMode(.inline)
    }

    private var span: String {
        let day = event.start.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
        let start = event.start.formatted(date: .omitted, time: .shortened)
        let end = event.end.formatted(date: .omitted, time: .shortened)
        return "\(day), \(start) – \(end)"
    }
}
