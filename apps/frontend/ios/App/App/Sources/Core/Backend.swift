import BalanceKit
import Foundation

/// Everything the phone asks the API. Screens never see this: the ``Store`` does, and the store is
/// handed either the real one or ``FixtureBackend`` — which is what the simulator smoke tests run
/// against, so they need no account, no network and no calendar.
@MainActor
protocol Backend: AnyObject {
    func sync(_ request: SyncRequest) async throws -> SyncResponse
    func events(from: Date, to: Date) async throws -> EventsPage
    func createEvent(_ body: [String: JSON]) async throws -> CalendarEvent
    func patchEvent(id: String, _ body: [String: JSON]) async throws -> CalendarEvent
    func deleteEvent(id: String, _ body: [String: JSON]) async throws
    func respond(id: String, calendarId: String, response: String) async throws -> CalendarEvent
    func setMapping(_ body: [String: JSON]) async throws
    func calendars() async throws -> CalendarsResponse
    func setWriteCalendar(id: String) async throws
    func preferences() async throws -> Preferences
    func profile() async throws -> Profile
    func weekSummary(weekStart: Date) async throws -> WatchSummary
    func googleConnectURL() async throws -> URL
    func watchTicket() async throws -> String
    func sessionSummary(slot: SessionSummary.Slot) async throws -> SessionSummary
    func commitDay(_ day: String, rest: Bool) async throws -> CommitResult
    func commitWeek(_ weekStart: String) async throws -> CommitResult
    func sessionSlots() async throws -> (enabled: Bool, slots: [SessionSlot])
    func saveRecords(source: String, records: [(calendarId: String, eventId: String, data: JSON)]) async throws
}

// MARK: - Sync protocol (`@elumixor/synced`)

struct Mutation: Encodable {
    let mutationId: String
    let kind: String
    let model: String
    let id: String
    var data: JSON?
    var patch: JSON?
}

struct SyncRequest: Encodable {
    let since: [String: Double]
    let mutations: [Mutation]
}

struct Envelope<T: Decodable>: Decodable {
    let id: String
    let updatedAt: Double
    let deleted: Bool
    let data: T?
}

struct SyncResponse: Decodable {
    struct Changes: Decodable {
        var categories: [Envelope<Sphere>]?
        var activities: [Envelope<Activity>]?
        var projects: [Envelope<Project>]?
        var tasks: [Envelope<TaskItem>]?
    }
    struct Rejected: Decodable {
        let mutationId: String
        let reason: String
    }
    let changes: Changes
    let since: [String: Double]
    let applied: [String]
    let rejected: [Rejected]
}

// MARK: - The deployed API

enum BackendError: LocalizedError {
    case notSignedIn
    case server(String, status: Int)
    case notJSON(String)

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "You're signed out."
        case .server(let message, _): return message
        case .notJSON(let path): return "\(path) answered with a page instead of data."
        }
    }
}

@MainActor
final class LiveBackend: Backend {
    let baseURL: URL
    private let token: () async throws -> String?
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 25
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        // Not `.iso8601`: the API's timestamps carry milliseconds, which that strategy refuses.
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            guard let date = ISO8601.date(from: raw) else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Not ISO 8601: \(raw)"))
            }
            return date
        }
        return d
    }()

    init(baseURL: URL, token: @escaping () async throws -> String?) {
        self.baseURL = baseURL
        self.token = token
    }

    private struct ErrorBody: Decodable { let error: String }
    private struct Empty: Decodable {}

    func request<T: Decodable>(
        _ method: String, _ path: String, query: [String: String] = [:], body: (any Encodable)? = nil,
        authenticated: Bool = true
    ) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if authenticated {
            guard let token = try await token() else { throw BackendError.notSignedIn }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .custom { date, encoder in
                var c = encoder.singleValueContainer()
                try c.encode(ISO8601.string(from: date))
            }
            request.httpBody = try encoder.encode(body)
        }
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            if status == 401 { throw BackendError.notSignedIn }
            let message = (try? Self.decoder.decode(ErrorBody.self, from: data))?.error ?? "The server answered \(status)."
            throw BackendError.server(message, status: status)
        }
        // Anything that isn't an API path answers with the web app's shell and a 200.
        let type = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "content-type") ?? ""
        guard type.contains("json") else { throw BackendError.notJSON(path) }
        return try Self.decoder.decode(T.self, from: data)
    }

    func sync(_ request: SyncRequest) async throws -> SyncResponse {
        try await self.request("POST", "/mobile/sync", body: request)
    }

    func events(from: Date, to: Date) async throws -> EventsPage {
        try await request("GET", "/mobile/calendar/events", query: ["from": ISO8601.string(from: from), "to": ISO8601.string(from: to)])
    }

    private struct EventBody: Decodable { let event: CalendarEvent }

    func createEvent(_ body: [String: JSON]) async throws -> CalendarEvent {
        let r: EventBody = try await request("POST", "/mobile/calendar/events", body: body)
        return r.event
    }

    func patchEvent(id: String, _ body: [String: JSON]) async throws -> CalendarEvent {
        let r: EventBody = try await request("PATCH", "/mobile/calendar/events/\(escape(id))", body: body)
        return r.event
    }

    func deleteEvent(id: String, _ body: [String: JSON]) async throws {
        let _: Empty = try await request("DELETE", "/mobile/calendar/events/\(escape(id))", body: body)
    }

    func respond(id: String, calendarId: String, response: String) async throws -> CalendarEvent {
        let r: EventBody = try await request(
            "POST", "/mobile/calendar/events/\(escape(id))/rsvp",
            body: ["calendarId": JSON.string(calendarId), "response": .string(response)]
        )
        return r.event
    }

    func setMapping(_ body: [String: JSON]) async throws {
        let _: Empty = try await request("POST", "/mobile/calendar/mappings", body: body)
    }

    func calendars() async throws -> CalendarsResponse {
        try await request("GET", "/mobile/calendar/calendars")
    }

    func setWriteCalendar(id: String) async throws {
        let _: Empty = try await request("PATCH", "/mobile/calendar/prefs", body: ["writeCalendarId": JSON.string(id)])
    }

    func preferences() async throws -> Preferences {
        try await request("GET", "/mobile/preferences")
    }

    func profile() async throws -> Profile {
        try await request("GET", "/mobile/auth/profile")
    }

    func weekSummary(weekStart: Date) async throws -> WatchSummary {
        try await request("GET", "/mobile/watch/summary", query: ["weekStart": ISO8601.string(from: weekStart)])
    }

    func googleConnectURL() async throws -> URL {
        struct Answer: Decodable { let url: URL }
        // `mode: app` answers with a page that says to come back, rather than redirecting anywhere.
        let answer: Answer = try await request(
            "POST", "/mobile/integrations/google/start",
            body: ["mode": JSON.string("app"), "origin": .string("https://localhost")]
        )
        return answer.url
    }

    func watchTicket() async throws -> String {
        struct Answer: Decodable { let ticket: String }
        let answer: Answer = try await request("POST", "/mobile/auth/watch/ticket", body: [String: JSON]())
        return answer.ticket
    }

    private var zone: String { TimeZone.current.identifier }

    func sessionSummary(slot: SessionSummary.Slot) async throws -> SessionSummary {
        try await request("GET", "/mobile/planning/summary", query: ["slot": slot.rawValue, "timeZone": zone])
    }

    func commitDay(_ day: String, rest: Bool) async throws -> CommitResult {
        try await request("POST", "/mobile/planning/day", body: ["day": JSON.string(day), "timeZone": .string(zone), "rest": .bool(rest)])
    }

    func commitWeek(_ weekStart: String) async throws -> CommitResult {
        try await request("POST", "/mobile/planning/week", body: ["weekStart": JSON.string(weekStart), "timeZone": .string(zone)])
    }

    func sessionSlots() async throws -> (enabled: Bool, slots: [SessionSlot]) {
        struct Answer: Decodable { let enabled: Bool; let slots: [SessionSlot] }
        let answer: Answer = try await request("GET", "/mobile/planning/notifications", query: ["timeZone": zone])
        return (answer.enabled, answer.slots)
    }

    func saveRecords(source: String, records: [(calendarId: String, eventId: String, data: JSON)]) async throws {
        let list = records.map { JSON.object(["calendarId": .string($0.calendarId), "externalEventId": .string($0.eventId), "data": $0.data]) }
        let _: Empty = try await request("POST", "/mobile/integrations/records", body: ["source": JSON.string(source), "records": .array(list)])
    }

    /// Trades a provider's identity token for a Clerk sign-in ticket. The one unauthenticated call.
    func nativeTicket(provider: String, idToken: String) async throws -> String {
        struct Answer: Decodable { let ticket: String }
        let answer: Answer = try await request(
            "POST", "/mobile/auth/native/\(provider)", body: ["idToken": JSON.string(idToken)], authenticated: false
        )
        return answer.ticket
    }

    private func escape(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id
    }
}
