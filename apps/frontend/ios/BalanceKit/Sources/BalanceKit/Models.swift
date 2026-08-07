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
    public let connected: Bool
    public let needsReconnect: Bool
    public let categories: [CategoryStat]
}
