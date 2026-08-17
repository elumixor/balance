import Foundation

/// Which seven days "this week" means.
///
/// The web app settled this: local midnight is what a person means by "Monday", and sending it as
/// an instant keeps the backend out of time-zone arithmetic entirely. The watch is in the same
/// position — the server runs in UTC and would otherwise hand someone two time zones east their
/// previous week for the first hours of every Monday — so it computes its own boundary here and
/// sends it along.
public enum Week {
    /// Monday midnight, in the wearer's own calendar and time zone.
    public static func localStart(of date: Date = Date(), calendar: Calendar = .current) -> Date {
        var calendar = calendar
        calendar.firstWeekday = 2
        return calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
    }
}
