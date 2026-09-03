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

/// How a timer run for an event is broken up: a nudge every so many minutes, or the event split
/// into equal parts. The length is the event's own, so it is never carried here. Wire form is
/// `{ "kind": "every", "minutes": 5 }` or `{ "kind": "parts", "count": 4 }`.
public enum EventTimer: Codable, Hashable, Sendable {
    case every(minutes: Int)
    case parts(Int)

    private enum CodingKeys: String, CodingKey { case kind, minutes, count }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "every": self = .every(minutes: try container.decode(Int.self, forKey: .minutes))
        case "parts": self = .parts(try container.decode(Int.self, forKey: .count))
        case let other:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Unknown timer kind \(other)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .every(let minutes):
            try container.encode("every", forKey: .kind)
            try container.encode(minutes, forKey: .minutes)
        case .parts(let count):
            try container.encode("parts", forKey: .kind)
            try container.encode(count, forKey: .count)
        }
    }
}

/// The next thing in the calendar, or the one happening right now — `inProgress` says which.
///
/// The category is the one the event counts most towards, and is absent when the event counts
/// towards nothing — the watch draws it as the event's glyph, so an unmapped event simply keeps the
/// calendar's own. `categoryId` is what a timer started for the event is pointed at, and `timer`
/// is how that timer wants to be broken up.
public struct NextEvent: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let calendarId: String
    public let title: String
    public let start: Date
    public let end: Date
    public let inProgress: Bool
    public let categoryId: String?
    public let categoryName: String?
    public let categoryColor: String?
    public let categoryIcon: String?
    /// How long before it starts the calendar itself would say something, in minutes. Nil when the
    /// event carries no popup reminder of its own, in which case the account's lead time is used.
    public let reminderMinutes: Int?
    public let timer: EventTimer?

    public init(
        id: String, calendarId: String, title: String, start: Date, end: Date, inProgress: Bool,
        categoryId: String? = nil, categoryName: String? = nil,
        categoryColor: String? = nil, categoryIcon: String? = nil, reminderMinutes: Int? = nil,
        timer: EventTimer? = nil
    ) {
        self.id = id
        self.calendarId = calendarId
        self.title = title
        self.start = start
        self.end = end
        self.inProgress = inProgress
        self.categoryId = categoryId
        self.categoryName = categoryName
        self.categoryColor = categoryColor
        self.categoryIcon = categoryIcon
        self.reminderMinutes = reminderMinutes
        self.timer = timer
    }

    /// How long the event runs, in whole minutes — the length a timer started for it takes.
    public var durationMinutes: Int {
        max(Int(end.timeIntervalSince(start) / 60), 1)
    }
}

/// A planned event a finished timer might have been for, offered back with how sure the server is.
public struct MatchCandidate: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let calendarId: String
    public let title: String
    public let start: Date
    public let end: Date
    public let categoryId: String?
    public let score: Double

    public init(
        id: String, calendarId: String, title: String, start: Date, end: Date,
        categoryId: String? = nil, score: Double
    ) {
        self.id = id
        self.calendarId = calendarId
        self.title = title
        self.start = start
        self.end = end
        self.categoryId = categoryId
        self.score = score
    }
}

/// What stopping a timer answers: the session that ended, if one was running, and the planned
/// events it might have been for — best first, and empty when there is nothing to ask.
public struct StoppedSession: Codable, Sendable {
    public let stopped: ActiveSession?
    public let candidates: [MatchCandidate]

    public init(stopped: ActiveSession?, candidates: [MatchCandidate] = []) {
        self.stopped = stopped
        self.candidates = candidates
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

/// How this account wants to be reminded about what is next. The watch only acts on this when no
/// iPhone is there to — see `EventAlarm` — but the lead time is the account's either way, so it is
/// answered here rather than kept on the wrist.
public struct WatchReminders: Codable, Hashable, Sendable {
    public let enabled: Bool
    public let leadMinutes: Int
    public let useCalendarReminders: Bool

    public init(enabled: Bool, leadMinutes: Int, useCalendarReminders: Bool) {
        self.enabled = enabled
        self.leadMinutes = leadMinutes
        self.useCalendarReminders = useCalendarReminders
    }

    /// What an account that has never set anything gets, and what an older server's answer means.
    public static let defaults = WatchReminders(enabled: true, leadMinutes: 5, useCalendarReminders: true)
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
    /// Absent from an older server's answer, which is what `defaults` is for.
    public let reminders: WatchReminders?

    public init(
        connected: Bool, needsReconnect: Bool, weekStart: Date, now: Date,
        categories: [WatchCategory], nextEvent: NextEvent?, active: ActiveSession?,
        reminders: WatchReminders? = nil
    ) {
        self.connected = connected
        self.needsReconnect = needsReconnect
        self.weekStart = weekStart
        self.now = now
        self.categories = categories
        self.nextEvent = nextEvent
        self.active = active
        self.reminders = reminders
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
