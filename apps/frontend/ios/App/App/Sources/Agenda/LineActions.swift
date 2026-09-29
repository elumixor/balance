import BalanceCore
import BalanceKit
import Foundation
import SwiftUI

/// What submitting a typed line does — to nothing yet, to an event, to a to-do. The list's
/// composer, a row being retyped, and the calendar's "new block here" all come through here, so a
/// line means the same thing wherever it was typed.
@MainActor
enum LineActions {
    /// The project a to-do goes to when its line names none: the last one a line did name.
    static var defaultProjectId: String {
        get { UserDefaults.standard.string(forKey: "defaultProjectId") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "defaultProjectId") }
    }

    static func defaultProject(in store: Store) -> Project? {
        store.projects[defaultProjectId].flatMap { $0.isActive ? $0 : nil } ?? store.activeProjects.first
    }

    /// A new event or to-do from a line. Returns what was made, or nil with the reason reported.
    @discardableResult
    static func create(_ line: TypedLine, in store: Store) async -> AgendaItem? {
        let title = line.title.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return nil }
        switch line.intent {
        case .event(let start, let end, let allDay):
            let made = await store.createEvent(.init(
                title: title, start: start, end: end, allDay: allDay, sphereId: line.sphereId,
                activityId: line.activityId, projectId: line.projectId, recurrence: line.recurrence
            ))
            return made.map(AgendaItem.event)
        case .task(let day):
            guard let project = line.projectId.flatMap({ store.projects[$0] }) ?? defaultProject(in: store) else {
                store.problems.append(.init(title: "Where does it go?", detail: "Add a time to put it on the calendar, or an @project for a to-do."))
                return nil
            }
            if line.projectId != nil { defaultProjectId = project.id }
            return .task(store.createTask(title: title, projectId: project.id, day: day))
        case nil:
            return nil
        }
    }

    /// The line a row is edited as.
    static func text(for item: AgendaItem, in store: Store) -> String {
        switch item {
        case .event(let e):
            // An activity is named by itself, a straight mapping by its sphere.
            let tag = e.activityId.flatMap { store.activities[$0]?.name } ?? store.sphere(of: e)?.name
            return LineWriter.event(
                title: e.title, start: e.start, end: e.end, allDay: e.allDay, sphere: tag,
                project: e.projectId.flatMap { store.projects[$0]?.name }, uses24h: Format.uses24h
            )
        case .task(let t):
            return LineWriter.task(title: t.title, day: t.day, project: store.projects[t.projectId]?.name)
        }
    }

    /// Applies a retyped line to what it was typed over. Only what the line changed is written.
    static func apply(_ line: TypedLine, to item: AgendaItem, in store: Store) async {
        switch item {
        case .event(let event): await apply(line, to: event, in: store)
        case .task(let task): await apply(line, to: task, in: store)
        }
    }

    private static func apply(_ line: TypedLine, to event: CalendarEvent, in store: Store) async {
        var fields: [String: JSON] = [:]
        var start = event.start, end = event.end
        let title = line.title.trimmingCharacters(in: .whitespaces)
        if event.movable {
            if !title.isEmpty, title != event.title { fields["title"] = .string(title) }
            if case .event(let s, let e, let allDay) = line.intent, allDay == event.allDay {
                start = s
                // A multi-day block keeps its length when only its first day was said.
                end = allDay && calendar(store).isDate(s, inSameDayAs: event.start) ? event.end : e
                if start != event.start || end != event.end {
                    fields["start"] = .string(ISO8601.string(from: start))
                    fields["end"] = .string(ISO8601.string(from: end))
                }
            }
        }
        if !fields.isEmpty {
            await store.patch(event, fields) {
                if let t = fields["title"], case .string(let v) = t { $0.title = v }
                $0.start = start
                $0.end = end
            }
        }
        let current = store.event(key: event.key) ?? event
        if let activity = line.activityId, activity != current.activityId {
            await store.setActivity(current, activityId: activity)
        } else if let sphere = line.sphereId, sphere != store.sphere(of: current)?.id || current.activityId != nil {
            await store.setSphere(current, sphereId: sphere)
        }
        if line.projectId != current.projectId {
            let latest = store.event(key: event.key) ?? current
            await store.map(latest, ["projectId": .from(line.projectId)]) { $0.projectId = line.projectId }
        }
    }

    private static func apply(_ line: TypedLine, to task: TaskItem, in store: Store) async {
        let title = line.title.trimmingCharacters(in: .whitespaces)
        // A time turns a to-do into a block on the calendar for it; the to-do stays where it was.
        if case .event(let start, let end, let allDay) = line.intent, !allDay {
            await store.createEvent(.init(
                title: title.isEmpty ? task.title : title, start: start, end: end, sphereId: line.sphereId,
                activityId: line.activityId, projectId: line.projectId ?? task.projectId
            ))
            return
        }
        var patch: [String: JSON] = [:]
        if !title.isEmpty, title != task.title { patch["title"] = .string(title) }
        let day: Date? = {
            switch line.intent {
            case .task(let d): return d
            case .event(let s, _, true): return s
            default: return nil
            }
        }()
        let newDay = day.map(DayString.string)
        if newDay != task.endsOn {
            patch["endsOn"] = .from(newDay)
            // A single-day to-do: a start after its new end would be a span backwards.
            if let starts = task.startsOn, let newDay, starts > newDay { patch["startsOn"] = .string(newDay) }
            if newDay == nil { patch["startsOn"] = .null }
        }
        if let project = line.projectId, project != task.projectId { patch["projectId"] = .string(project) }
        if !patch.isEmpty { store.updateTask(task.id, patch) }
    }

    private static func calendar(_ store: Store) -> Calendar { store.calendar }
}
