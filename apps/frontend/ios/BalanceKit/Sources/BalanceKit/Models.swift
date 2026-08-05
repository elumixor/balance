import Foundation

public struct Category: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String
    public var color: String
    public var targetHoursPerWeek: Double
    public var isBuffer: Bool
    public var archived: Bool

    public init(
        id: String, name: String, color: String, targetHoursPerWeek: Double,
        isBuffer: Bool, archived: Bool
    ) {
        self.id = id
        self.name = name
        self.color = color
        self.targetHoursPerWeek = targetHoursPerWeek
        self.isBuffer = isBuffer
        self.archived = archived
    }
}

public struct ActivityWeight: Codable, Hashable, Sendable {
    public let categoryId: String
    public let weightPercent: Int

    public init(categoryId: String, weightPercent: Int) {
        self.categoryId = categoryId
        self.weightPercent = weightPercent
    }
}

public struct Activity: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String
    public var archived: Bool
    public var weights: [ActivityWeight]

    public init(id: String, name: String, archived: Bool, weights: [ActivityWeight]) {
        self.id = id
        self.name = name
        self.archived = archived
        self.weights = weights
    }
}

public struct Entry: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let activityId: String
    public let activityName: String
    public let startedAt: Date
    public var endedAt: Date?
    public var note: String?

    public init(id: String, activityId: String, activityName: String, startedAt: Date, endedAt: Date?, note: String?) {
        self.id = id
        self.activityId = activityId
        self.activityName = activityName
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.note = note
    }

    public var isRunning: Bool { endedAt == nil }
}

public struct TrackData: Codable, Sendable {
    public let entries: [Entry]
    public let recentActivities: [ActivityRef]
    public let frequentActivities: [ActivityRef]
}

public struct ActivityRef: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
}

public struct CategoryStat: Codable, Identifiable, Sendable {
    public var id: String { categoryId }
    public let categoryId: String
    public let name: String
    public let color: String
    public let targetHours: Double
    public let actualHours: Double
    public let diffHours: Double
    public let diffPercent: Double
    public let status: String
}

public struct StatsResponse: Codable, Sendable {
    public let categories: [CategoryStat]
}
