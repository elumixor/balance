import SwiftUI
import BalanceKit

/// The calendar as one list that never ends.
///
/// Days follow each other in a single scroll, so the crown does what it does everywhere on the
/// watch; the list grows at either end as it is neared, because "what did I have on Tuesday" and
/// "what is on next Friday" are the same question. The day at the top is named in a header that
/// stays put — "Today", "This Friday" — with its date beside it.
///
/// Days are fetched a week at a time and kept for as long as the screen is open. Out of range, the
/// days the summary already covers are drawn from it, and the rest say so.
struct DaysView: View {
    /// What the summary already knows, so today is drawn before any request lands and a wrist with
    /// no signal still has the fortnight ahead.
    let seed: [NextEvent]

    @Environment(WatchRouter.self) private var router
    @State private var model = DayEventsModel()
    @State private var offsets = Array(-Self.growBy...Self.growBy * 3)
    /// The day at the top of the list. Bound to the scroll position, which is also what keeps the
    /// visible day still when earlier days are added above it.
    @State private var topDay: Int? = 0

    /// How many days the list grows by when an end comes near.
    private static let growBy = 14
    private static let edgeMargin = 4
    /// How far away today may be for the way back to be one animated scroll. Further than this the
    /// list first lands a few days short, where nothing has to be laid out on the way, and glides
    /// the rest — a long animated scroll through a lazy list is what stutters.
    private static let glideDays = 4

    var body: some View {
        ScrollViewReader { proxy in
            list.onAppear { proxy.scrollTo(topDay ?? 0, anchor: .top) }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    router.path = NavigationPath()
                } label: {
                    Image(systemName: "timer")
                }
            }
            if (topDay ?? 0) != 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: backToToday) {
                        Image(systemName: "arrow.uturn.backward")
                    }
                }
            }
        }
        .navigationDestination(for: NextEvent.self) { EventDetailView(event: $0) }
        .onAppear { model.seed(seed) }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                ForEach(offsets, id: \.self) { offset in
                    DaySection(
                        day: model.day(at: offset),
                        events: model.events(at: offset),
                        state: model.state(at: offset),
                        // The pinned header above already says this day's name.
                        hidesHeader: offset == (topDay ?? 0)
                    )
                    .id(offset)
                    .onAppear { reached(offset) }
                }
            }
            .scrollTargetLayout()
            .padding(.horizontal, 2)
            .padding(.bottom, 12)
        }
        .scrollPosition(id: $topDay, anchor: .top)
        .overlay(alignment: .top) {
            DayHeader(day: model.day(at: topDay ?? 0))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(.black)
                .animation(nil, value: topDay)
        }
    }

    private func reached(_ offset: Int) {
        Task { await model.load(around: offset) }
        guard let first = offsets.first, let last = offsets.last else { return }
        if offset - first < Self.edgeMargin {
            offsets.insert(contentsOf: (first - Self.growBy)..<first, at: 0)
        }
        if last - offset < Self.edgeMargin {
            offsets.append(contentsOf: (last + 1)...(last + Self.growBy))
        }
    }

    private func backToToday() {
        let from = topDay ?? 0
        if abs(from) > Self.glideDays {
            var jump = Transaction()
            jump.disablesAnimations = true
            withTransaction(jump) { topDay = from > 0 ? Self.glideDays : -Self.glideDays }
        }
        Task { @MainActor in
            withAnimation(.snappy(duration: 0.35)) { topDay = 0 }
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

    /// The week holding `offset`, and the one beside it the crown is heading towards, so scrolling
    /// past a week's edge rarely waits.
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

/// A day's name the way it is talked about — "Today", "This Friday", "Next Monday" — and then its
/// date, quieter.
private struct DayHeader: View {
    let day: Date

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(Self.relativeName(for: day))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Calendar.current.isDateInToday(day) ? Color.accentColor : .primary)
            Text(Self.date(for: day))
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
        .lineLimit(1)
    }

    private static func date(for day: Date) -> String {
        let sameYear = Calendar.current.isDate(day, equalTo: .now, toGranularity: .year)
        return sameYear
            ? day.formatted(.dateTime.day().month(.abbreviated))
            : day.formatted(.dateTime.day().month(.abbreviated).year())
    }

    /// Weeks begin on Monday here, as they do everywhere else in the app.
    static func relativeName(for day: Date) -> String {
        var calendar = Calendar.current
        calendar.firstWeekday = 2
        let today = calendar.startOfDay(for: .now)
        let distance = calendar.dateComponents([.day], from: today, to: calendar.startOfDay(for: day)).day ?? 0
        let weekday = day.formatted(.dateTime.weekday(.wide))
        switch distance {
        case 0: return "Today"
        case 1: return "Tomorrow"
        case -1: return "Yesterday"
        default: break
        }
        guard let thisWeek = calendar.dateInterval(of: .weekOfYear, for: today),
              let dayWeek = calendar.dateInterval(of: .weekOfYear, for: day)
        else { return weekday }
        let weeks = calendar.dateComponents([.weekOfYear], from: thisWeek.start, to: dayWeek.start).weekOfYear ?? 0
        switch weeks {
        case 0: return "This \(weekday)"
        case 1: return "Next \(weekday)"
        case -1: return "Last \(weekday)"
        default: return weekday
        }
    }
}

/// One day in the list: its header, then its events, or a quiet line saying there are none.
private struct DaySection: View {
    let day: Date
    let events: [NextEvent]
    let state: DayEventsModel.State
    let hidesHeader: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            DayHeader(day: day)
                .padding(.horizontal, 4)
                .opacity(hidesHeader ? 0 : 1)

            if events.isEmpty {
                Text(emptyText)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 4)
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
    }

    private var emptyText: String {
        switch state {
        case .loading: return "…"
        case .loaded: return "Nothing planned"
        case .offline: return "No connection"
        case .failed: return "Couldn't load this day"
        }
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
