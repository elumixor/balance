import Foundation
import ClerkKit

public enum APIError: Error, LocalizedError {
    case notAuthenticated
    case server(String)
    case invalidResponse

    /// Whether this is the network being away rather than the server saying no.
    ///
    /// A watch loses its connection constantly, and "not signed in yet" is the same thing from the
    /// app's point of view: the ticket has not come across from the phone, so there is nobody to
    /// ask. Both mean *keep what is on the wrist and try again later*, which is what separates a
    /// timer that goes on running from one that has to be rolled back.
    public var isOffline: Bool {
        switch self {
        case .notAuthenticated: return true
        case .server, .invalidResponse: return false
        }
    }

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated: return "Not signed in."
        case .server(let message): return message
        case .invalidResponse: return "Unexpected response from server."
        }
    }
}

@MainActor
public final class APIClient {
    public static let shared = APIClient()

    /// Defaults to the deployed production backend — no local dev server needed. A simulator run
    /// with the sign-in bypass on points at the local one instead (see `DevAuth`).
    public var baseURL = DevAuth.apiBaseURL ?? URL(string: "https://balance-app-mauve.vercel.app")!

    private let session = URLSession.shared

    /// A wrist does not wait. Past this the request has failed as far as the person is concerned,
    /// and the offline path — keep the timer, queue the write — is a better answer than a spinner.
    private let timeout: TimeInterval = 20
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        // Not `.iso8601`: the backend's timestamps carry milliseconds, which that strategy refuses.
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
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private init() {}

    private func authorizedRequest(
        path: String, method: String, query: [String: String] = [:], body: (any Encodable)? = nil
    ) async throws -> URLRequest {
        // With the bypass on there is no Clerk session to ask, and the backend isn't reading the
        // header anyway — it answers as `DEV_AUTH_EMAIL` whatever the token says.
        let token: String
        if DevAuth.isEnabled {
            token = DevAuth.token
        } else if let session = try await Clerk.shared.session?.getToken() {
            token = session
        } else {
            throw APIError.notAuthenticated
        }
        var request = URLRequest(url: url(path: path, query: query), timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body {
            request.httpBody = try encoder.encode(body)
        }
        return request
    }

    /// A query string is appended by hand rather than through `appendingPathComponent`, which would
    /// percent-encode the `?` and turn the whole thing into one very strange path.
    private func url(path: String, query: [String: String]) -> URL {
        let base = baseURL.appendingPathComponent(path)
        guard !query.isEmpty else { return base }
        let encoded = query
            .map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")" }
            .joined(separator: "&")
        return URL(string: "\(base.absoluteString)?\(encoded)") ?? base
    }

    private func send<Response: Decodable>(
        path: String, method: String, query: [String: String] = [:], body: (any Encodable)? = nil
    ) async throws -> Response {
        let request = try await authorizedRequest(path: path, method: method, query: query, body: body)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }

        guard (200..<300).contains(http.statusCode) else {
            if let errorBody = try? decoder.decode(ErrorBody.self, from: data) {
                throw APIError.server(errorBody.error)
            }
            throw APIError.server("Request failed with status \(http.statusCode)")
        }

        // Anything that isn't an API path answers with the web app's own shell — a 200 full of
        // HTML — so a wrong path reads as a decoding failure rather than a 404. Saying which it
        // was is the difference between an afternoon and a minute.
        guard (http.value(forHTTPHeaderField: "content-type") ?? "").contains("json") else {
            throw APIError.server("\(path) answered with a page, not JSON — check the API path")
        }

        return try decoder.decode(Response.self, from: data)
    }

    private struct ErrorBody: Decodable { let error: String }
    private struct Empty: Decodable {}

    private func send(path: String, method: String, body: (any Encodable)? = nil) async throws {
        let _: Empty = try await send(path: path, method: method, body: body)
    }

    // MARK: Watch

    /// The whole watch face in one call — the week, what's next, and any running timer. The week
    /// boundary travels with the request: see ``Week/localStart(of:calendar:)``.
    public func fetchWatchSummary(weekStart: Date = Week.localStart()) async throws -> WatchSummary {
        try await send(
            path: "/mobile/watch/summary",
            method: "GET",
            query: ["weekStart": ISO8601.string(from: weekStart)]
        )
    }

    /// Every timed event between `from` and `to` — the caller's own midnights, so a day is the day
    /// where the wrist is rather than where the server runs.
    public func fetchDays(from: Date, to: Date) async throws -> DayEvents {
        try await send(
            path: "/mobile/watch/days",
            method: "GET",
            query: ["from": ISO8601.string(from: from), "to": ISO8601.string(from: to)]
        )
    }

    // MARK: Tracking

    public func fetchCurrentSession() async throws -> ActiveSession? {
        struct Response: Decodable { let active: ActiveSession? }
        let response: Response = try await send(path: "/mobile/tracking/current", method: "GET")
        return response.active
    }

    /// Starts a timer, replacing whatever was running. A nil `durationMinutes` is open-ended: the
    /// session runs until it is stopped, and the calendar event it writes is only provisional.
    /// With an `eventId` (and its qualified `calendarId`) the timer runs against that planned
    /// event instead of writing one of its own.
    public func startTracking(
        categoryId: String, durationMinutes: Int? = nil, title: String? = nil,
        eventId: String? = nil, calendarId: String? = nil, startedAt: Date? = nil
    ) async throws -> ActiveSession {
        struct Body: Encodable {
            let categoryId: String
            let durationMinutes: Int?
            let title: String?
            let eventId: String?
            let calendarId: String?
            let startedAt: String?
        }
        struct Response: Decodable { let active: ActiveSession }
        let response: Response = try await send(
            path: "/mobile/tracking/start",
            method: "POST",
            body: Body(
                categoryId: categoryId, durationMinutes: durationMinutes, title: title,
                eventId: eventId, calendarId: calendarId,
                startedAt: startedAt.map(ISO8601.string(from:))
            )
        )
        return response.active
    }

    /// A timer that ran and finished while the watch had no network, told to the server once it
    /// has one again — one call rather than a start and a stop replayed in order, so no other
    /// screen ever shows a timer that ended an hour ago as running.
    @discardableResult
    public func logTracking(
        categoryId: String, startedAt: Date, endedAt: Date, title: String? = nil
    ) async throws -> ActiveSession {
        struct Body: Encodable {
            let categoryId: String
            let startedAt: String
            let endedAt: String
            let title: String?
        }
        struct Response: Decodable { let session: ActiveSession }
        let response: Response = try await send(
            path: "/mobile/tracking/log",
            method: "POST",
            body: Body(
                categoryId: categoryId,
                startedAt: ISO8601.string(from: startedAt),
                endedAt: ISO8601.string(from: endedAt),
                title: title
            )
        )
        return response.session
    }

    /// Stops the running timer and returns what was stopped — nil if nothing was running, since
    /// asking twice is not an error, only a watch face that was a moment behind — along with the
    /// planned events the timer might have been for.
    @discardableResult
    public func stopTracking(at endedAt: Date? = nil) async throws -> StoppedSession {
        struct Body: Encodable { let endedAt: String? }
        struct Response: Decodable {
            let stopped: ActiveSession?
            let candidates: [MatchCandidate]?
        }
        let response: Response = try await send(
            path: "/mobile/tracking/stop", method: "POST",
            body: Body(endedAt: endedAt.map(ISO8601.string(from:)))
        )
        return StoppedSession(stopped: response.stopped, candidates: response.candidates ?? [])
    }

    /// "Yes, that was the one": folds a finished timer into the planned event it was for.
    @discardableResult
    public func matchTracking(sessionId: String, calendarId: String, eventId: String) async throws -> ActiveSession {
        struct Body: Encodable {
            let sessionId: String
            let calendarId: String
            let eventId: String
        }
        struct Response: Decodable { let session: ActiveSession }
        let response: Response = try await send(
            path: "/mobile/tracking/match", method: "POST",
            body: Body(sessionId: sessionId, calendarId: calendarId, eventId: eventId)
        )
        return response.session
    }

    /// Re-lengthens the running session, measured from when it started rather than from now.
    @discardableResult
    public func extendTracking(durationMinutes: Int) async throws -> ActiveSession {
        struct Body: Encodable { let durationMinutes: Int }
        struct Response: Decodable { let active: ActiveSession }
        let response: Response = try await send(
            path: "/mobile/tracking/extend", method: "POST", body: Body(durationMinutes: durationMinutes)
        )
        return response.active
    }

    // MARK: Voice

    /// One dictated instruction, carried out on the server. The wrist only says the words: what
    /// they mean is worked out where the tools that can act on this account live.
    public func sendVoiceCommand(text: String, timeZone: String = TimeZone.current.identifier) async throws -> VoiceReply {
        struct Body: Encodable {
            let text: String
            let timeZone: String
        }
        return try await send(path: "/mobile/watch/voice", method: "POST", body: Body(text: text, timeZone: timeZone))
    }

    // MARK: Calendars

    public func fetchCalendars() async throws -> CalendarsResponse {
        try await send(path: "/mobile/calendar/calendars", method: "GET")
    }

    /// Points new events at a calendar. `id` is the qualified `accountId::calendarId` form.
    public func setWriteCalendar(id: String) async throws {
        struct Body: Encodable { let writeCalendarId: String }
        try await send(path: "/mobile/calendar/prefs", method: "PATCH", body: Body(writeCalendarId: id))
    }
}
