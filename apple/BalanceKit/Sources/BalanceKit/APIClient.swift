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
        d.dateDecodingStrategy = .iso8601
        return d
    }()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private init() {}

    private func authorizedRequest(path: String, method: String, body: (any Encodable)? = nil) async throws -> URLRequest {
        guard let token = try await Clerk.shared.session?.getToken() else {
            throw APIError.notAuthenticated
        }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body {
            request.httpBody = try encoder.encode(body)
        }
        return request
    }

    private func send<Response: Decodable>(path: String, method: String, body: (any Encodable)? = nil) async throws -> Response {
        let request = try await authorizedRequest(path: path, method: method, body: body)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }

        guard (200..<300).contains(http.statusCode) else {
            if let errorBody = try? decoder.decode(ErrorBody.self, from: data) {
                throw APIError.server(errorBody.error)
            }
            throw APIError.server("Request failed with status \(http.statusCode)")
        }

        return try decoder.decode(Response.self, from: data)
    }

    private struct ErrorBody: Decodable { let error: String }
    private struct Empty: Decodable {}

    private func send(path: String, method: String, body: (any Encodable)? = nil) async throws {
        let _: Empty = try await send(path: path, method: method, body: body)
    }

    // MARK: Categories

    public func fetchCategories() async throws -> [Category] {
        struct Response: Decodable { let categories: [Category] }
        let response: Response = try await send(path: "/api/mobile/categories", method: "GET")
        return response.categories
    }

    public struct CategoryInput: Encodable {
        public var name: String
        public var color: String
        public var targetHoursPerWeek: Double

        public init(name: String, color: String, targetHoursPerWeek: Double) {
            self.name = name
            self.color = color
            self.targetHoursPerWeek = targetHoursPerWeek
        }
    }

    public func createCategory(_ input: CategoryInput) async throws {
        try await send(path: "/api/mobile/categories", method: "POST", body: input)
    }

    public func updateCategory(id: String, _ input: CategoryInput) async throws {
        try await send(path: "/api/mobile/categories/\(id)", method: "PATCH", body: input)
    }

    public func archiveCategory(id: String) async throws {
        try await send(path: "/api/mobile/categories/\(id)/archive", method: "POST")
    }

    // MARK: Activities

    public func fetchActivities() async throws -> [Activity] {
        struct Response: Decodable { let activities: [Activity] }
        let response: Response = try await send(path: "/api/mobile/activities", method: "GET")
        return response.activities
    }

    public struct ActivityInput: Encodable {
        public var name: String
        public var weights: [ActivityWeight]

        public init(name: String, weights: [ActivityWeight]) {
            self.name = name
            self.weights = weights
        }
    }

    public func createActivity(_ input: ActivityInput) async throws {
        try await send(path: "/api/mobile/activities", method: "POST", body: input)
    }

    public func updateActivity(id: String, _ input: ActivityInput) async throws {
        try await send(path: "/api/mobile/activities/\(id)", method: "PATCH", body: input)
    }

    public func archiveActivity(id: String) async throws {
        try await send(path: "/api/mobile/activities/\(id)/archive", method: "POST")
    }

    // MARK: Entries & Timer

    public func fetchTrackData(limit: Int = 20) async throws -> TrackData {
        try await send(path: "/api/mobile/entries?limit=\(limit)", method: "GET")
    }

    public func fetchRunningEntry() async throws -> Entry? {
        struct Response: Decodable { let entry: Entry? }
        let response: Response = try await send(path: "/api/mobile/entries/running", method: "GET")
        return response.entry
    }

    public func startTimer(activityId: String) async throws {
        struct Body: Encodable { let activityId: String }
        try await send(path: "/api/mobile/timer/start", method: "POST", body: Body(activityId: activityId))
    }

    public func stopTimer() async throws {
        try await send(path: "/api/mobile/timer/stop", method: "POST")
    }

    public struct ManualEntryInput: Encodable {
        public var activityId: String
        public var startedAt: Date
        public var endedAt: Date
        public var note: String?

        public init(activityId: String, startedAt: Date, endedAt: Date, note: String?) {
            self.activityId = activityId
            self.startedAt = startedAt
            self.endedAt = endedAt
            self.note = note
        }
    }

    public func createEntry(_ input: ManualEntryInput) async throws {
        try await send(path: "/api/mobile/entries", method: "POST", body: input)
    }

    public func updateEntry(id: String, _ input: ManualEntryInput) async throws {
        try await send(path: "/api/mobile/entries/\(id)", method: "PATCH", body: input)
    }

    public func deleteEntry(id: String) async throws {
        try await send(path: "/api/mobile/entries/\(id)", method: "DELETE")
    }

    // MARK: Stats

    public func fetchStats(period: String, date: Date = Date()) async throws -> StatsResponse {
        let iso = ISO8601DateFormatter().string(from: date)
        return try await send(path: "/api/mobile/stats?period=\(period)&date=\(iso)", method: "GET")
    }
}
