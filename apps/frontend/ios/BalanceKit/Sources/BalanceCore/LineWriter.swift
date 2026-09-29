import Foundation

/// The other direction: an event or a task written back as the line that would have made it.
///
/// Editing a row is editing this text, so it has to read back through ``LineReader`` to the same
/// thing — the tests hold the two to that. Days are said the way a person would say them relative
/// to today, and a name with spaces loses them, since a `#tag` ends at the first one.
public enum LineWriter {
    public static func tag(_ name: String) -> String {
        name.split(whereSeparator: { $0.isWhitespace }).map { word in
            word.prefix(1).uppercased() + word.dropFirst()
        }.joined()
    }

    public static func event(
        title: String, start: Date, end: Date, allDay: Bool, sphere: String? = nil, project: String? = nil,
        now: Date = Date(), calendar: Calendar = .current, uses24h: Bool = true
    ) -> String {
        var parts = [title.trimmingCharacters(in: .whitespaces)]
        let day = calendar.startOfDay(for: start)
        parts.append(dayWord(day, now: now, calendar: calendar, force: allDay))
        if allDay {
            parts.append("all day")
        } else {
            let range = "\(clock(start, calendar: calendar, uses24h: uses24h))-\(clock(end, calendar: calendar, uses24h: uses24h))"
            parts.append(range)
        }
        if let sphere { parts.append("#" + tag(sphere)) }
        if let project { parts.append("@" + tag(project)) }
        return parts.filter { !$0.isEmpty }.joined(separator: " ")
    }

    public static func task(title: String, day: Date?, project: String?, now: Date = Date(), calendar: Calendar = .current) -> String {
        var parts = [title.trimmingCharacters(in: .whitespaces)]
        if let day { parts.append(dayWord(day, now: now, calendar: calendar, force: true)) }
        if let project { parts.append("@" + tag(project)) }
        return parts.filter { !$0.isEmpty }.joined(separator: " ")
    }

    /// "today" is left out of a timed event's line: a time on its own already means today.
    static func dayWord(_ day: Date, now: Date, calendar: Calendar, force: Bool) -> String {
        let today = calendar.startOfDay(for: now)
        let offset = calendar.dateComponents([.day], from: today, to: calendar.startOfDay(for: day)).day ?? 0
        switch offset {
        case 0: return force ? "today" : ""
        case 1: return "tomorrow"
        case -1: return "yesterday"
        case 2...6:
            let weekday = calendar.component(.weekday, from: day)
            return Grammar.weekdays.first { $0.index == weekday }!.names[0]
        default:
            let d = calendar.component(.day, from: day)
            let m = calendar.component(.month, from: day)
            let y = calendar.component(.year, from: day)
            let sameYear = y == calendar.component(.year, from: now)
            return sameYear ? "\(d).\(m)" : "\(d).\(m).\(y)"
        }
    }

    static func clock(_ date: Date, calendar: Calendar, uses24h: Bool) -> String {
        let h = calendar.component(.hour, from: date)
        let m = calendar.component(.minute, from: date)
        if uses24h { return String(format: "%d:%02d", h, m) }
        let suffix = h < 12 ? "am" : "pm"
        let h12 = h % 12 == 0 ? 12 : h % 12
        return m == 0 ? "\(h12)\(suffix)" : String(format: "%d:%02d%@", h12, m, suffix)
    }
}
