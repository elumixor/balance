import Foundation

/// Parses and prints the timestamps the backend speaks.
///
/// Nitro serialises every date with JavaScript's `toISOString()`, which always carries
/// milliseconds, while `JSONDecoder.DateDecodingStrategy.iso8601` rejects fractional seconds
/// outright. Both spellings are accepted here so neither side has to remember the other's
/// precision.
public enum ISO8601 {
    public static func date(from string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string)
    }

    public static func string(from date: Date) -> String {
        withFraction.string(from: date)
    }

    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let plain = ISO8601DateFormatter()
}

/// One category's week, as the watch draws it: how much was aimed for and how much has happened.
public struct WatchCategory: Codable, Identifiable, Hashable, Sendable, DialCategory {
    public let id: String
    public let name: String
    public let color: String
    public let icon: String
    public let targetHours: Double
    public let actualHours: Double

    public init(
        id: String, name: String, color: String, icon: String, targetHours: Double, actualHours: Double
    ) {
        self.id = id
        self.name = name
        self.color = color
        self.icon = icon
        self.targetHours = targetHours
        self.actualHours = actualHours
    }
}

/// The next thing in the calendar, or the one happening right now — `inProgress` says which.
///
/// The category is the one the event counts most towards, and is absent when the event counts
/// towards nothing — the watch draws it as the event's glyph, so an unmapped event simply keeps the
/// calendar's own.
public struct NextEvent: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let calendarId: String
    public let title: String
    public let start: Date
    public let end: Date
    public let inProgress: Bool
    public let categoryColor: String?
    public let categoryIcon: String?

    public init(
        id: String, calendarId: String, title: String, start: Date, end: Date, inProgress: Bool,
        categoryColor: String? = nil, categoryIcon: String? = nil
    ) {
        self.id = id
        self.calendarId = calendarId
        self.title = title
        self.start = start
        self.end = end
        self.inProgress = inProgress
        self.categoryColor = categoryColor
        self.categoryIcon = categoryIcon
    }
}

/// A running timer. `plannedEndAt` is nil for an open-ended session — one that runs until stopped.
public struct ActiveSession: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let categoryId: String
    public let categoryName: String
    public let categoryColor: String
    public let categoryIcon: String
    public let eventId: String
    /// Qualified as `accountId::calendarId`, the form every calendar route expects.
    public let calendarId: String
    public let startedAt: Date
    public let plannedEndAt: Date?

    public init(
        id: String, categoryId: String, categoryName: String, categoryColor: String,
        categoryIcon: String, eventId: String, calendarId: String, startedAt: Date, plannedEndAt: Date?
    ) {
        self.id = id
        self.categoryId = categoryId
        self.categoryName = categoryName
        self.categoryColor = categoryColor
        self.categoryIcon = categoryIcon
        self.eventId = eventId
        self.calendarId = calendarId
        self.startedAt = startedAt
        self.plannedEndAt = plannedEndAt
    }
}

/// Everything a watch face needs in one round trip. The buffer category is not in `categories` —
/// the backend leaves it out, because a wrist has no room for the thing that absorbs the rest.
public struct WatchSummary: Codable, Sendable {
    public let connected: Bool
    public let needsReconnect: Bool
    public let weekStart: Date
    public let now: Date
    public let categories: [WatchCategory]
    public let nextEvent: NextEvent?
    public let active: ActiveSession?

    public init(
        connected: Bool, needsReconnect: Bool, weekStart: Date, now: Date,
        categories: [WatchCategory], nextEvent: NextEvent?, active: ActiveSession?
    ) {
        self.connected = connected
        self.needsReconnect = needsReconnect
        self.weekStart = weekStart
        self.now = now
        self.categories = categories
        self.nextEvent = nextEvent
        self.active = active
    }
}

/// One calendar in a connected account. `id` is qualified `accountId::calendarId`.
public struct CalendarRef: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let accountId: String
    public let name: String
    public let color: String?
    public let primary: Bool
    public let readOnly: Bool

    public init(id: String, accountId: String, name: String, color: String?, primary: Bool, readOnly: Bool) {
        self.id = id
        self.accountId = accountId
        self.name = name
        self.color = color
        self.primary = primary
        self.readOnly = readOnly
    }
}

/// A connected Google account and the calendars it can see.
public struct CalendarAccount: Codable, Identifiable, Hashable, Sendable {
    public var id: String { accountId }
    public let accountId: String
    public let email: String
    public let needsReconnect: Bool
    public let calendars: [CalendarRef]

    public init(accountId: String, email: String, needsReconnect: Bool, calendars: [CalendarRef]) {
        self.accountId = accountId
        self.email = email
        self.needsReconnect = needsReconnect
        self.calendars = calendars
    }
}

/// The calendar picker's whole state: what is connected, what is shown, and where writes go.
public struct CalendarsResponse: Codable, Sendable {
    public let connected: Bool
    public let needsReconnect: Bool
    public let accounts: [CalendarAccount]
    public let visibleCalendarIds: [String]
    public let writeCalendarId: String

    public init(
        connected: Bool, needsReconnect: Bool, accounts: [CalendarAccount],
        visibleCalendarIds: [String], writeCalendarId: String
    ) {
        self.connected = connected
        self.needsReconnect = needsReconnect
        self.accounts = accounts
        self.visibleCalendarIds = visibleCalendarIds
        self.writeCalendarId = writeCalendarId
    }
}
