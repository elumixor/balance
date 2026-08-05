import Foundation

/// A minimal snapshot of the currently-running timer, written by the Watch app whenever it
/// starts/stops tracking and read by the Widget extension, which runs in its own process and
/// has no other cheap way to know what's running without making its own network call.
public struct TrackingSnapshot: Codable, Sendable, Equatable {
    public let activityId: String
    public let activityName: String
    public let startedAt: Date

    public init(activityId: String, activityName: String, startedAt: Date) {
        self.activityId = activityId
        self.activityName = activityName
        self.startedAt = startedAt
    }
}

/// Reads and writes ``TrackingSnapshot`` to a shared App Group container.
///
/// This is the chosen mechanism for keeping the Balance Watch Widget in sync with the Watch
/// app: the app writes here every time it starts/stops a timer (and asks WidgetKit to reload),
/// so the widget's own timeline provider only ever needs to read a small local UserDefaults
/// blob — no network call, no extra latency, no extra failure mode inside the widget process.
public enum WatchSharedState {
    /// Must match the App Group entitlement added to both the Watch app and Widget extension targets.
    public static let appGroupID = "group.com.elumixor.balance"

    private static let key = "currentTrackingSnapshot"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    public static func save(_ snapshot: TrackingSnapshot?) {
        guard let defaults else { return }
        guard let snapshot else {
            defaults.removeObject(forKey: key)
            return
        }
        if let data = try? encoder.encode(snapshot) {
            defaults.set(data, forKey: key)
        }
    }

    public static func load() -> TrackingSnapshot? {
        guard let defaults, let data = defaults.data(forKey: key) else { return nil }
        return try? decoder.decode(TrackingSnapshot.self, from: data)
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
