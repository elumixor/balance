import BalanceCore
import Foundation

/// How times, days and lengths are written everywhere on the phone, so the list, the grid and the
/// card never say the same hour two ways.
enum Format {
    static var uses24h: Bool {
        !(DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: .current) ?? "").contains("a")
    }

    static func time(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    static func range(_ start: Date, _ end: Date) -> String {
        "\(time(start))–\(time(end))"
    }

    /// "45m", "1h 30m", "2h".
    static func duration(minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m)m" }
        return m == 0 ? "\(h)h" : "\(h)h \(m)m"
    }

    static func day(_ date: Date, calendar: Calendar = .current) -> String {
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInTomorrow(date) { return "Tomorrow" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: .now), to: calendar.startOfDay(for: date)).day ?? 0
        if (2...6).contains(days) { return date.formatted(.dateTime.weekday(.wide)) }
        return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    /// A line the reader has taken apart, said back in words: "Tomorrow, 7:00–7:45".
    static func when(_ line: TypedLine) -> String? {
        switch line.intent {
        case .event(let start, let end, let allDay):
            if allDay {
                let days = Calendar.current.dateComponents([.day], from: start, to: end).day ?? 1
                return days > 1 ? "\(day(start)) · \(days) days" : "\(day(start)) · all day"
            }
            return "\(day(start)), \(range(start, end))"
        case nil:
            return nil
        }
    }
}
