import Foundation

/// One category inside a ``WatchSnapshot`` — everything a complication needs to draw a ring.
public struct SnapshotCategory: Codable, Sendable, Equatable, Identifiable, DialCategory {
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

/// The next thing in the calendar, flattened to the few fields a widget has room for. The end is
/// carried as well as the start because an event that has already begun has nothing to count down
/// to but its own finish, and the widget has no way to ask for it.
///
/// It is optional only so a snapshot written by an older build still decodes: a widget reading one
/// falls back to saying the event is on, rather than losing the whole blob and drawing nothing.
public struct SnapshotEvent: Codable, Sendable, Equatable {
    public let title: String
    public let start: Date
    public let end: Date?
    /// The category the event counts most towards, absent when it counts towards nothing. Both are
    /// optional for the same reason `end` is: a blob written by an older build still decodes, and
    /// falls back to the calendar's own glyph.
    public let categoryColor: String?
    public let categoryIcon: String?

    public init(
        title: String, start: Date, end: Date? = nil,
        categoryColor: String? = nil, categoryIcon: String? = nil
    ) {
        self.title = title
        self.start = start
        self.end = end
        self.categoryColor = categoryColor
        self.categoryIcon = categoryIcon
    }

    /// The glyph to draw beside the title: the category's, or a calendar page when the event counts
    /// towards nothing — which is a truer picture there than ``Icons/fallback``'s bare circle.
    public var symbol: String {
        guard let categoryIcon else { return "calendar" }
        return Icons.symbol(for: categoryIcon)
    }

    /// How long this event still has to run, from `now`, or nil when it hasn't started or its end
    /// is unknown or already past.
    public func remaining(at now: Date) -> Date? {
        guard start <= now, let end, end > now else { return nil }
        return end
    }
}

/// The running timer, flattened the same way. `plannedEndAt` is nil while it is open-ended.
public struct SnapshotSession: Codable, Sendable, Equatable {
    public let categoryName: String
    public let categoryColor: String
    public let categoryIcon: String
    public let startedAt: Date
    public let plannedEndAt: Date?

    public init(
        categoryName: String, categoryColor: String, categoryIcon: String, startedAt: Date, plannedEndAt: Date?
    ) {
        self.categoryName = categoryName
        self.categoryColor = categoryColor
        self.categoryIcon = categoryIcon
        self.startedAt = startedAt
        self.plannedEndAt = plannedEndAt
    }

    /// The running session as the widget needs it. Written here rather than at each call site so
    /// the app and the blob can never disagree about which timer is on.
    public init(session: ActiveSession) {
        self.init(
            categoryName: session.categoryName,
            categoryColor: session.categoryColor,
            categoryIcon: session.categoryIcon,
            startedAt: session.startedAt,
            plannedEndAt: session.plannedEndAt
        )
    }
}

/// A snapshot of how things stand, written by the Watch app whenever it refreshes and read by the
/// Widget extension, which runs in its own process and has no other cheap way to show anything
/// without making its own network call.
///
/// It holds the whole week rather than a single headline because a widget family may want any
/// slice of it — one ring, all of them, or neither — and picking that in the widget is free while
/// fetching it there is not. Still small enough to sit in UserDefaults without a second thought.
public struct WatchSnapshot: Codable, Sendable, Equatable {
    public let categories: [SnapshotCategory]
    public let nextEvent: SnapshotEvent?
    public let active: SnapshotSession?
    public let updatedAt: Date

    /// The category furthest below its target — the one thing worth showing when there's room for one.
    public var mostBehind: SnapshotCategory? {
        categories.filter { $0.targetHours > 0 }.min { $0.ratio < $1.ratio }
    }

    public init(
        categories: [SnapshotCategory], nextEvent: SnapshotEvent?, active: SnapshotSession?, updatedAt: Date
    ) {
        self.categories = categories
        self.nextEvent = nextEvent
        self.active = active
        self.updatedAt = updatedAt
    }
}

extension WatchSnapshot {
    /// Built straight from a ``WatchSummary`` — the watch app has no reason to reshape it by hand.
    public init(summary: WatchSummary) {
        self.init(
            categories: summary.categories.map {
                SnapshotCategory(
                    id: $0.id, name: $0.name, color: $0.color, icon: $0.icon,
                    targetHours: $0.targetHours, actualHours: $0.actualHours
                )
            },
            nextEvent: summary.nextEvent.map {
                SnapshotEvent(
                    title: $0.title, start: $0.start, end: $0.end,
                    categoryColor: $0.categoryColor, categoryIcon: $0.categoryIcon
                )
            },
            active: summary.active.map(SnapshotSession.init(session:)),
            updatedAt: summary.now
        )
    }
}

/// Reads and writes ``WatchSnapshot`` to a shared App Group container.
///
/// This is the chosen mechanism for keeping the Balance Watch Widget in sync with the Watch app:
/// the app writes here every time it refreshes its stats (and asks WidgetKit to reload), so the
/// widget's own timeline provider only ever needs to read a small local UserDefaults blob — no
/// network call, no extra latency, no extra failure mode inside the widget process.
public enum WatchSharedState {
    /// Must match the App Group entitlement added to both the Watch app and Widget extension targets.
    public static let appGroupID = "group.com.elumixor.balance"

    private static let key = "currentWatchSnapshot"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    public static func save(_ snapshot: WatchSnapshot?) {
        guard let defaults else { return }
        guard let snapshot else {
            defaults.removeObject(forKey: key)
            return
        }
        if let data = try? encoder.encode(snapshot) {
            defaults.set(data, forKey: key)
        }
    }

    public static func load() -> WatchSnapshot? {
        guard let defaults, let data = defaults.data(forKey: key) else { return nil }
        return try? decoder.decode(WatchSnapshot.self, from: data)
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
