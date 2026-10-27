import Foundation

struct AgendaSection: Identifiable, Equatable {
    enum Kind: String { case today, tomorrow, week, later }
    let kind: Kind
    let items: [CalendarEvent]
    var id: String { kind.rawValue }

    var title: String {
        switch kind {
        case .today: return "Today"
        case .tomorrow: return "Tomorrow"
        case .week: return "This week"
        case .later: return "Coming up"
        }
    }

    /// How much of it is behind you: ended events over everything in it.
    func progress(now: Date) -> Double {
        guard !items.isEmpty else { return 0 }
        return Double(items.filter { $0.end <= now }.count) / Double(items.count)
    }
}

/// Splits the calendar into the sections of the list — the puretype buckets, with a day's events
/// in them: today, tomorrow, the rest of this week, and the fortnight after.
enum AgendaModel {
    static let horizonDays = 14
    /// A section longer than this shows its first rows and a way to the rest.
    static let preview = 6

    static func sections(events: [CalendarEvent], now: Date, calendar: Calendar) -> [AgendaSection] {
        let today = calendar.startOfDay(for: now)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today)!
        let dayAfter = calendar.date(byAdding: .day, value: 2, to: today)!
        var mondays = calendar
        mondays.firstWeekday = 2
        let weekEnd = mondays.dateInterval(of: .weekOfYear, for: today)!.end
        let horizon = calendar.date(byAdding: .day, value: horizonDays, to: today)!

        func kind(of day: Date) -> AgendaSection.Kind {
            if day < tomorrow { return .today }
            if day < dayAfter { return .tomorrow }
            if day < weekEnd { return .week }
            return .later
        }

        var buckets: [AgendaSection.Kind: [(Date, Int, CalendarEvent)]] = [:]
        for event in events where !event.declined && event.end > today && event.start < horizon {
            // A block that began before today but is still going is today's.
            let day = max(calendar.startOfDay(for: event.start), today)
            buckets[kind(of: day), default: []].append((event.allDay ? day : event.start, event.allDay ? 0 : 1, event))
        }

        let order: [AgendaSection.Kind] = [.today, .tomorrow, .week, .later]
        return order.compactMap { k in
            let rows = (buckets[k] ?? []).sorted { a, b in
                let da = calendar.startOfDay(for: a.0), db = calendar.startOfDay(for: b.0)
                if da != db { return da < db }
                if a.1 != b.1 { return a.1 < b.1 }
                return a.0 < b.0
            }
            // Today is always there to type into, even when it holds nothing.
            if rows.isEmpty, k != .today { return nil }
            return AgendaSection(kind: k, items: rows.map(\.2))
        }
    }
}
