import BalanceCore
import BalanceKit
import Foundation
import SwiftUI

/// What submitting a typed line does — to nothing yet, or to an event. The list's composer, a row
/// being retyped, and the calendar's "new block here" all come through here, so a line means the
/// same thing wherever it was typed.
@MainActor
enum LineActions {
    /// A new event from a line. Returns what was made, or nil when the line makes nothing.
    @discardableResult
    static func create(_ line: TypedLine, in store: Store) async -> CalendarEvent? {
        let title = line.title.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty, case .event(let start, let end, let allDay) = line.intent else { return nil }
        return await store.createEvent(.init(
            title: title, start: start, end: end, allDay: allDay, sphereId: line.sphereId,
            activityId: line.activityId, recurrence: line.recurrence
        ))
    }

    /// The line a row is edited as.
    static func text(for e: CalendarEvent, in store: Store) -> String {
        // An activity is named by itself, a straight mapping by its sphere.
        let tag = e.activityId.flatMap { store.activities[$0]?.name } ?? store.sphere(of: e)?.name
        return LineWriter.event(
            title: e.title, start: e.start, end: e.end, allDay: e.allDay, sphere: tag, uses24h: Format.uses24h
        )
    }

    /// Applies a retyped line to the event it was typed over. Only what the line changed is written.
    static func apply(_ line: TypedLine, to event: CalendarEvent, in store: Store) async {
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
    }

    private static func calendar(_ store: Store) -> Calendar { store.calendar }
}
