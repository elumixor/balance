import Foundation

/// The last week the server answered with, kept on the watch.
///
/// A watch is offline more often than any other thing this app runs on — out of range of the
/// phone, off Wi-Fi, on a run with nothing but itself — and a screen that can only draw what a
/// request just returned is a spinner for all of it. So every summary that arrives is written
/// here, and the screen is drawn from this before the first request is even sent: the ring, the
/// categories a timer is started from and what is coming up are all things that were true a
/// moment ago and are still worth looking at.
///
/// It is deliberately separate from ``WatchSharedState``, which the widget reads: that one is a
/// flattened snapshot for another process to draw, this one is the whole answer so the app can
/// carry on working from it — including starting a timer against a category it names.
public enum WatchCache {
    /// The same App Group the widget's snapshot lives in, so a single entitlement covers both.
    private static let key = "lastWatchSummary"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: WatchSharedState.appGroupID)
    }

    public static func save(_ summary: WatchSummary) {
        guard let defaults, let data = try? encoder.encode(summary) else { return }
        defaults.set(data, forKey: key)
    }

    public static func load() -> WatchSummary? {
        guard let defaults, let data = defaults.data(forKey: key) else { return nil }
        return try? decoder.decode(WatchSummary.self, from: data)
    }

    public static func clear() {
        defaults?.removeObject(forKey: key)
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            guard let date = ISO8601.date(from: raw) else {
                throw DecodingError.dataCorrupted(
                    .init(codingPath: decoder.codingPath, debugDescription: "Not an ISO 8601 date: \(raw)")
                )
            }
            return date
        }
        return d
    }()
}
