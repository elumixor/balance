import Foundation
import BalanceKit

/// The writes the watch owes the server, and the timer it is running without one.
///
/// A wrist is out of range often enough that "you have no signal, so you cannot start a timer" is
/// not an answer anybody accepts — the watch is *on the run*, which is exactly when the timer
/// matters. So a session started with no network runs entirely here, and the calendar is told
/// about it as a single finished block once there is a connection again. Nothing is replayed as a
/// start-then-stop pair: by the time the server can be reached the session is over, and a replayed
/// start would put a timer that ended an hour ago back on every other screen.
///
/// Both halves are on disk rather than in memory, because the case this exists for is a watch that
/// is put down, sleeps, and is picked up somewhere with signal — possibly after the app has been
/// killed.

/// One thing the server still has to be told.
enum PendingWrite: Codable, Identifiable, Equatable {
    /// A whole session that began and ended offline. `eventId` is set when the timer was run for
    /// something already on the calendar, in which case the block is not written again — the
    /// planned one is timed, exactly as it would have been with a signal.
    case logged(
        id: UUID, categoryId: String, startedAt: Date, endedAt: Date, title: String?,
        eventId: String?, calendarId: String?
    )
    /// A session the server already knows is running, stopped while there was no signal. The
    /// moment travels with it, or the hours would grow by however long the watch stayed offline.
    case stopped(id: UUID, at: Date)
    /// "Yes, that timer was for this planned event", answered with nothing to answer it to.
    case matched(id: UUID, sessionId: String, calendarId: String, eventId: String)

    var id: UUID {
        switch self {
        case .logged(let id, _, _, _, _, _, _): return id
        case .stopped(let id, _): return id
        case .matched(let id, _, _, _): return id
        }
    }
}

/// The queue itself: ordered, on disk, drained oldest first.
@MainActor
@Observable
final class PendingWrites {
    static let shared = PendingWrites()

    private(set) var writes: [PendingWrite] = []

    /// Set by a write the server actively refused, which is the one failure worth a word on screen
    /// — an offline queue that is simply waiting is not news.
    var errorMessage: String?

    private let key = "pendingWatchWrites"
    private var isFlushing = false

    private init() {
        writes = decode() ?? []
    }

    var isEmpty: Bool { writes.isEmpty }

    func enqueue(_ write: PendingWrite) {
        writes.append(write)
        persist()
    }

    /// Sends what is owed, oldest first.
    ///
    /// Two failures, two answers. Still no network: the write stays where it is and everything
    /// behind it waits, because these are a person's hours and their order is the story. A refusal
    /// from the server — a category that has since been deleted, a session already closed — drops
    /// the write and says so, since a record that can never succeed would otherwise block every
    /// one behind it forever.
    ///
    /// Answers whether anything actually reached the server, which is what tells a screen its week
    /// is now out of date.
    @discardableResult
    func flush() async -> Bool {
        guard !isFlushing, !writes.isEmpty else { return false }
        isFlushing = true
        defer { isFlushing = false }

        var landed = false
        while let write = writes.first {
            do {
                try await send(write)
                landed = true
            } catch {
                if isOfflineFailure(error) { break }
                errorMessage = error.localizedDescription
            }
            writes.removeFirst()
            persist()
        }
        if landed { errorMessage = nil }
        return landed
    }

    private func send(_ write: PendingWrite) async throws {
        switch write {
        case .logged(_, let categoryId, let startedAt, let endedAt, let title, let eventId, let calendarId):
            // A timer run against a planned event is replayed as the pair it really was, because
            // the point of it was that no second block should appear beside the planned one. The
            // stop carries its own moment, so the two calls landing a second apart changes nothing.
            if let eventId, let calendarId {
                _ = try await APIClient.shared.startTracking(
                    categoryId: categoryId,
                    durationMinutes: max(Int(endedAt.timeIntervalSince(startedAt) / 60), 1),
                    eventId: eventId, calendarId: calendarId, startedAt: startedAt
                )
                try await APIClient.shared.stopTracking(at: endedAt)
            } else {
                try await APIClient.shared.logTracking(
                    categoryId: categoryId, startedAt: startedAt, endedAt: endedAt, title: title
                )
            }
        case .stopped(_, let at):
            try await APIClient.shared.stopTracking(at: at)
        case .matched(_, let sessionId, let calendarId, let eventId):
            _ = try await APIClient.shared.matchTracking(
                sessionId: sessionId, calendarId: calendarId, eventId: eventId
            )
        }
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(writes) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func decode() -> [PendingWrite]? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode([PendingWrite].self, from: data)
    }
}

/// The timer the watch is running, kept across launches.
///
/// The server's answer is the truth whenever there is one, so this is only ever consulted for a
/// session the server has not been told about — one started offline. It survives the app being
/// killed because a watch that is put down mid-session and picked up an hour later must not come
/// back having quietly forgotten the hour.
enum LocalSession {
    private static let key = "localWatchSession"

    struct Stored: Codable, Equatable {
        let session: ActiveSession
        let ticks: TrackingPlan
        /// The title the block should carry when it is finally written — the category's name
        /// otherwise, which is what the server falls back to anyway.
        let title: String?
        /// The planned event the timer was run for, when it was run for one, so the block that is
        /// finally written is that event and not a second one beside it.
        let eventId: String?
        let calendarId: String?
    }

    static func save(_ stored: Stored?) {
        guard let stored else {
            UserDefaults.standard.removeObject(forKey: key)
            return
        }
        guard let data = try? encoder.encode(stored) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    static func load() -> Stored? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? decoder.decode(Stored.self, from: data)
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
