import Foundation

/// A minimal snapshot of how the week is going, written by the Watch app whenever it refreshes
/// and read by the Widget extension, which runs in its own process and has no other cheap way to
/// show anything without making its own network call.
public struct WeekSnapshot: Codable, Sendable, Equatable {
    /// The category furthest from its target — the one thing worth showing on a watch face.
    public let categoryName: String
    public let categoryColor: String
    public let actualHours: Double
    public let targetHours: Double
    public let updatedAt: Date

    public init(categoryName: String, categoryColor: String, actualHours: Double, targetHours: Double, updatedAt: Date) {
        self.categoryName = categoryName
        self.categoryColor = categoryColor
        self.actualHours = actualHours
        self.targetHours = targetHours
        self.updatedAt = updatedAt
    }
}

/// Reads and writes ``WeekSnapshot`` to a shared App Group container.
///
/// This is the chosen mechanism for keeping the Balance Watch Widget in sync with the Watch app:
/// the app writes here every time it refreshes its stats (and asks WidgetKit to reload), so the
/// widget's own timeline provider only ever needs to read a small local UserDefaults blob — no
/// network call, no extra latency, no extra failure mode inside the widget process.
public enum WatchSharedState {
    /// Must match the App Group entitlement added to both the Watch app and Widget extension targets.
    public static let appGroupID = "group.com.elumixor.balance"

    private static let key = "currentWeekSnapshot"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    public static func save(_ snapshot: WeekSnapshot?) {
        guard let defaults else { return }
        guard let snapshot else {
            defaults.removeObject(forKey: key)
            return
        }
        if let data = try? encoder.encode(snapshot) {
            defaults.set(data, forKey: key)
        }
    }

    public static func load() -> WeekSnapshot? {
        guard let defaults, let data = defaults.data(forKey: key) else { return nil }
        return try? decoder.decode(WeekSnapshot.self, from: data)
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
