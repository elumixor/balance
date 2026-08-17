import Foundation
import ClerkKit

public enum APIError: Error, LocalizedError {
    case notAuthenticated
    case server(String)
    case invalidResponse

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

    /// Defaults to the deployed production backend — no local dev server needed.
    public var baseURL = URL(string: "https://balance-app-mauve.vercel.app")!

    private let session = URLSession.shared
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
        guard let token = try await Clerk.shared.session?.getToken() else {
            throw APIError.notAuthenticated
        }
        var request = URLRequest(url: url(path: path, query: query))
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

    // MARK: Tracking

    public func fetchCurrentSession() async throws -> ActiveSession? {
        struct Response: Decodable { let active: ActiveSession? }
        let response: Response = try await send(path: "/mobile/tracking/current", method: "GET")
        return response.active
    }

    /// Starts a timer, replacing whatever was running. A nil `durationMinutes` is open-ended: the
    /// session runs until it is stopped, and the calendar event it writes is only provisional.
    public func startTracking(
        categoryId: String, durationMinutes: Int? = nil, title: String? = nil
    ) async throws -> ActiveSession {
        struct Body: Encodable {
            let categoryId: String
            let durationMinutes: Int?
            let title: String?
        }
        struct Response: Decodable { let active: ActiveSession }
        let response: Response = try await send(
            path: "/mobile/tracking/start",
            method: "POST",
            body: Body(categoryId: categoryId, durationMinutes: durationMinutes, title: title)
        )
        return response.active
    }

    /// Stops the running timer and returns what was stopped, or nil if nothing was running —
    /// asking twice is not an error, only a watch face that was a moment behind.
    @discardableResult
    public func stopTracking() async throws -> ActiveSession? {
        struct Response: Decodable { let stopped: ActiveSession? }
        let response: Response = try await send(path: "/mobile/tracking/stop", method: "POST")
        return response.stopped
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
