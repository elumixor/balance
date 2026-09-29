import Foundation

/// A sitting: the review of the day behind, and the day being planned — `PlanningService.summary`.
struct SessionSummary: Codable, Equatable {
    enum Slot: String, Codable { case evening, morning, weekly }

    struct Rank: Codable, Equatable {
        let stars: Int
        let tier: Int
        let subtier: Int
        let toNextSubtier: Int
    }

    struct Award: Codable, Equatable {
        let reason: String
        let delta: Int
    }

    struct Block: Codable, Equatable, Identifiable {
        let id: String
        let title: String
        let start: Date
        let end: Date
        let categoryId: String?
        let color: String?
        let icon: String?
        let hours: Double
    }

    struct CategoryHours: Codable, Equatable, Identifiable {
        let categoryId: String
        let name: String
        let color: String
        let icon: String
        let hours: Double
        let targetHours: Double
        var id: String { categoryId }
    }

    struct Day: Codable, Equatable {
        let day: String
        let planned: Bool
        let rest: Bool
        let coverage: Double
        let mappedHours: Double
        let budgetHours: Double
        let blocks: [Block]
        var hours: Double?
        var categories: [CategoryHours]?
        var top: [Block]?
    }

    struct Week: Codable, Equatable {
        let weekStart: String
        let categories: [CategoryHours]
        let match: Double
        let hours: Double
    }

    struct Copy: Codable, Equatable {
        struct Point: Codable, Equatable {
            let text: String
            let eventId: String?
        }
        let title: String
        let body: String
        let points: [Point]
    }

    let slot: Slot
    let today: String
    let connected: Bool
    let rank: Rank
    let streak: Int
    let coverageThreshold: Double
    let award: [Award]
    let weeklyAward: Int
    let review: Day
    let target: Day
    let week: Week?
    let copy: Copy

    /// What committing the planned day pays now, the week's sitting included.
    var planStars: Int { award.reduce(0) { $0 + $1.delta } + weeklyAward }

    /// The day as stars: all three for a day kept to the bar, two for most of one, one for any
    /// hour given a meaning. Nothing here can say "failed" — an unlit star is one not lit yet.
    var reviewStars: Int {
        if review.rest || review.coverage >= coverageThreshold { return 3 }
        if review.coverage >= coverageThreshold / 2 { return 2 }
        return review.coverage > 0 ? 1 : 0
    }

    var nextDayWord: String { slot == .morning ? "today" : "tomorrow" }
}

struct CommitResult: Codable {
    let alreadyPlanned: Bool
    let awarded: [SessionSummary.Award]
    let stars: Int
}

struct SessionSlot: Codable {
    let slot: String
    let day: String
    let at: Date
    let title: String
    let body: String
}

struct SessionPreferences: Codable, Hashable {
    var enabled: Bool
    var eveningTime: String
    var morningTime: String

    static let defaults = SessionPreferences(enabled: true, eveningTime: "18:00", morningTime: "08:00")

    /// Which sitting it is: the evening's from its hour on, the morning's before.
    func slot(at date: Date, calendar: Calendar = .current) -> SessionSummary.Slot {
        let parts = eveningTime.split(separator: ":").compactMap { Int($0) }
        let evening = (parts.first ?? 18) * 60 + (parts.count > 1 ? parts[1] : 0)
        let now = calendar.component(.hour, from: date) * 60 + calendar.component(.minute, from: date)
        return now >= evening ? .evening : .morning
    }
}
