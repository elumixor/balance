import Foundation

/// One row of the list: something on the calendar, or something to do.
enum AgendaItem: Identifiable, Hashable {
    case event(CalendarEvent)
    case task(TaskItem)

    var id: String {
        switch self {
        case .event(let e): return "e:\(e.key)"
        case .task(let t): return "t:\(t.id)"
        }
    }
}

struct AgendaSection: Identifiable, Equatable {
    enum Kind: String { case today, tomorrow, week, later, someday }
    let kind: Kind
    let items: [AgendaItem]
    var id: String { kind.rawValue }

    var title: String {
        switch kind {
        case .today: return "Today"
        case .tomorrow: return "Tomorrow"
        case .week: return "This week"
        case .later: return "Coming up"
        case .someday: return "Someday"
        }
    }

    /// How much of it is behind you: ended events and finished to-dos over everything in it.
    func progress(now: Date) -> Double {
        guard !items.isEmpty else { return 0 }
        let done = items.filter {
            switch $0 {
            case .event(let e): return e.end <= now
            case .task(let t): return t.isDone
            }
        }.count
        return Double(done) / Double(items.count)
    }
}

/// Splits the calendar and the to-dos into the sections of the list — the puretype buckets, with a
/// day's events in them: what is overdue, today, tomorrow, the rest of this week, the fortnight
/// after, and what has no day at all.
enum AgendaModel {
    static let horizonDays = 14
    static let staleDays = 7
    /// A section longer than this shows its first rows and a way to the rest.
    static let preview = 6

    static func sections(
        events: [CalendarEvent], tasks: [TaskItem], projects: [String: Project], now: Date, calendar: Calendar,
        ticked: Set<String> = []
    ) -> [AgendaSection] {
        let today = calendar.startOfDay(for: now)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today)!
        let dayAfter = calendar.date(byAdding: .day, value: 2, to: today)!
        var mondays = calendar
        mondays.firstWeekday = 2
        let weekEnd = mondays.dateInterval(of: .weekOfYear, for: today)!.end
        let horizon = calendar.date(byAdding: .day, value: horizonDays, to: today)!

        // What slipped is today's to do, the way it is on paper: it heads today's list.
        func kind(of day: Date) -> AgendaSection.Kind? {
            if day < tomorrow { return .today }
            if day < dayAfter { return .tomorrow }
            if day < weekEnd { return .week }
            return .later
        }

        let staleBefore = calendar.date(byAdding: .day, value: -staleDays, to: today)!
        // A heading over subtasks is not itself something to do.
        let parents = Set(tasks.compactMap(\.parentId))

        var buckets: [AgendaSection.Kind: [(Date, Int, AgendaItem)]] = [:]
        for event in events where !event.declined && event.end > today && event.start < horizon {
            // A block that began before today but is still going is today's.
            let day = max(calendar.startOfDay(for: event.start), today)
            guard let k = kind(of: day) else { continue }
            buckets[k, default: []].append((event.allDay ? day : event.start, event.allDay ? 0 : 1, .event(event)))
        }
        for task in tasks {
            guard let project = projects[task.projectId], project.isActive, !parents.contains(task.id) else { continue }
            // A plan that slipped weeks ago is no longer a date; it is back to someday.
            if let day = task.day, day >= staleBefore {
                // Finished to-dos stay on today, and wherever they were just ticked off.
                if task.isDone, !(day >= today && day < tomorrow), !ticked.contains(task.id) { continue }
                let k = kind(of: day) ?? .later
                buckets[k, default: []].append((max(day, today), day < today ? -1 : 2, .task(task)))
            } else if !task.isDone || ticked.contains(task.id) {
                buckets[.someday, default: []].append((.distantFuture, task.ordinal, .task(task)))
            }
        }

        let order: [AgendaSection.Kind] = [.today, .tomorrow, .week, .later, .someday]
        return order.compactMap { k in
            let rows = (buckets[k] ?? []).sorted { a, b in
                if k == .someday { return a.1 < b.1 }
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
