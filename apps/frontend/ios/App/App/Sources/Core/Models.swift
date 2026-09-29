import BalanceKit
import Foundation
import SwiftUI

/// A sphere of life — a category on the ring — as `/mobile/sync` sends it.
struct Sphere: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var color: String
    var icon: String
    var targetHoursPerWeek: Double
    var isBuffer: Bool

    var tint: Color { Color(hex: color) }
    var symbol: String { Icons.symbol(for: icon) }
}

struct Weight: Codable, Hashable {
    let categoryId: String
    let weightPercent: Int
}

/// A template that splits an hour across spheres.
struct Activity: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var weights: [Weight]
}

struct Project: Codable, Identifiable, Hashable {
    let id: String
    var parentId: String?
    var categoryId: String
    var name: String
    var icon: String?
    var status: String
    var ordinal: Int

    var isActive: Bool { status == "active" }
}

/// A to-do under a project. Days are `YYYY-MM-DD`, read in the device's own zone.
struct TaskItem: Codable, Identifiable, Hashable {
    let id: String
    var projectId: String
    var stageId: String?
    var parentId: String?
    var title: String
    var description: String
    var status: String
    var statusLabel: String
    var priority: String?
    var startsOn: String?
    var endsOn: String?
    var assigneeIds: [String]
    var estimateHours: Double?
    var ordinal: Int
    var notionUrl: String?

    var isDone: Bool { status == "done" || status == "dropped" }
    /// The day it is due by — its end when it has one, its start otherwise.
    var day: Date? { (endsOn ?? startsOn).flatMap(DayString.date) }
}

struct Attendee: Codable, Hashable {
    let email: String?
    let name: String?
    let isSelf: Bool
    let response: String
    let optional: Bool

    enum CodingKeys: String, CodingKey {
        case email, name, response, optional
        case isSelf = "self"
    }

    var displayName: String { name?.isEmpty == false ? name! : email ?? "Someone" }
}

struct EventReminder: Codable, Hashable {
    let method: String
    let minutes: Int
}

/// An event from the calendar with what it counts as — `CalendarEventDTO` on the server.
struct CalendarEvent: Codable, Identifiable, Hashable {
    let id: String
    var calendarId: String
    var seriesId: String?
    var title: String
    var description: String?
    var start: Date
    var end: Date
    var allDay: Bool
    var declined: Bool
    var tentative: Bool
    var readOnly: Bool
    var movable: Bool
    var countsTowardHours: Bool
    var url: String?
    var mappingScope: String?
    var activityId: String?
    var activityName: String?
    var weights: [Weight]
    var projectId: String?
    var taskId: String?
    var endLocation: String?
    var notes: String?
    var location: String?
    var conferenceUrl: String?
    var conferenceName: String?
    var attendees: [Attendee]
    var organizer: Attendee?
    var invited: Bool
    var response: String?
    var reminders: [EventReminder]
    var timeZone: String?
    var recurrence: [String]?

    /// Two calendars can hold the same id; the pair cannot collide.
    var key: String { "\(calendarId)|\(id)" }
    var isRepeating: Bool { seriesId != nil }
    var durationMinutes: Int { Int(end.timeIntervalSince(start) / 60) }

    /// The sphere its hours mostly go to: the heaviest weight that isn't the buffer.
    func sphere(in spheres: [String: Sphere]) -> Sphere? {
        let ranked = weights.sorted { $0.weightPercent > $1.weightPercent }
        return ranked.compactMap { spheres[$0.categoryId] }.first { !$0.isBuffer }
            ?? ranked.compactMap { spheres[$0.categoryId] }.first
    }
}

struct ReminderPreferences: Codable, Hashable {
    var enabled: Bool
    var leadMinutes: Int
    var useCalendarReminders: Bool
    var leaveInTime: Bool
    var sound: Bool

    static let defaults = ReminderPreferences(enabled: true, leadMinutes: 5, useCalendarReminders: true, leaveInTime: true, sound: true)
}

struct Preferences: Codable, Hashable {
    var reminders: ReminderPreferences
    var sessions: SessionPreferences?
}

struct Profile: Codable, Hashable {
    let name: String
    let email: String
    let imageUrl: String
}

/// What a range of the calendar answered: its events, and whether there is a calendar at all.
struct EventsPage: Codable {
    let connected: Bool
    let needsReconnect: Bool
    let writeCalendarId: String?
    let events: [CalendarEvent]
}

/// `YYYY-MM-DD` in the device's own calendar, which is what a task's days are.
enum DayString {
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func date(_ string: String) -> Date? {
        formatter.timeZone = .current
        return formatter.date(from: string)
    }

    static func string(_ date: Date) -> String {
        formatter.timeZone = .current
        return formatter.string(from: date)
    }
}
