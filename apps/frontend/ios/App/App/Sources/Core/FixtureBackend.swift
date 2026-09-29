import BalanceKit
import Foundation

/// A whole account held in memory: a week of events, a few spheres, projects and tasks.
///
/// It answers every call the way the API would, so the app launched with `-fixtures` is the real
/// app on a made-up week — which is what the simulator smoke tests drive, and what a screenshot
/// can be taken of without anybody's calendar in it.
@MainActor
final class FixtureBackend: Backend {
    private var spheres: [Sphere]
    private var activities: [Activity]
    private var projects: [Project]
    private var tasks: [TaskItem]
    private var events: [CalendarEvent]
    private var clock: Double = 1

    init(now: Date = Date(), calendar: Calendar = .current) {
        spheres = [
            Sphere(id: "s-work", name: "Deep work", color: "#3D5A80", icon: "briefcase", targetHoursPerWeek: 30, isBuffer: false),
            Sphere(id: "s-health", name: "Health", color: "#E07A5F", icon: "heart", targetHoursPerWeek: 8, isBuffer: false),
            Sphere(id: "s-people", name: "People", color: "#81B29A", icon: "users", targetHoursPerWeek: 10, isBuffer: false),
            Sphere(id: "s-rest", name: "Rest", color: "#E9C46A", icon: "moon", targetHoursPerWeek: 56, isBuffer: false),
            Sphere(id: "s-buffer", name: "Buffer", color: "#8A9097", icon: "circle", targetHoursPerWeek: 0, isBuffer: true),
        ]
        activities = [Activity(id: "a-gym", name: "Gym session", weights: [Weight(categoryId: "s-health", weightPercent: 100)])]
        projects = [
            Project(id: "p-atma", parentId: nil, categoryId: "s-work", name: "ATMA", icon: nil, status: "active", ordinal: 0),
            Project(id: "p-home", parentId: nil, categoryId: "s-people", name: "Home", icon: nil, status: "active", ordinal: 1),
        ]
        let today = calendar.startOfDay(for: now)
        func day(_ offset: Int) -> Date { calendar.date(byAdding: .day, value: offset, to: today)! }
        func at(_ offset: Int, _ h: Int, _ m: Int = 0) -> Date {
            calendar.date(bySettingHour: h, minute: m, second: 0, of: day(offset))!
        }
        tasks = [
            TaskItem(id: "t-1", projectId: "p-atma", stageId: nil, parentId: nil, title: "Write the combat notes", description: "",
                     status: "todo", statusLabel: "", priority: nil, startsOn: nil, endsOn: DayString.string(day(0)),
                     assigneeIds: [], estimateHours: nil, ordinal: 0, notionUrl: nil),
            TaskItem(id: "t-2", projectId: "p-home", stageId: nil, parentId: nil, title: "Book the plumber", description: "",
                     status: "todo", statusLabel: "", priority: nil, startsOn: nil, endsOn: nil,
                     assigneeIds: [], estimateHours: nil, ordinal: 0, notionUrl: nil),
        ]
        func event(
            _ id: String, _ title: String, _ start: Date, _ end: Date, sphere: String?, allDay: Bool = false,
            invited: Bool = false, location: String? = nil, call: String? = nil
        ) -> CalendarEvent {
            CalendarEvent(
                id: id, calendarId: "acc::primary", seriesId: nil, title: title, description: nil, start: start, end: end,
                allDay: allDay, declined: false, tentative: false, readOnly: false, movable: !invited,
                countsTowardHours: sphere != nil, url: nil, mappingScope: sphere == nil ? nil : "instance",
                activityId: nil, activityName: nil,
                weights: sphere.map { [Weight(categoryId: $0, weightPercent: 100)] } ?? [], projectId: nil, taskId: nil,
                endLocation: nil, notes: nil, location: location, conferenceUrl: call, conferenceName: call == nil ? nil : "Google Meet",
                attendees: invited ? [
                    Attendee(email: "anna@example.com", name: "Anna", isSelf: false, response: "accepted", optional: false),
                    Attendee(email: "me@example.com", name: nil, isSelf: true, response: "needsAction", optional: false),
                ] : [],
                organizer: invited ? Attendee(email: "anna@example.com", name: "Anna", isSelf: false, response: "accepted", optional: false) : nil,
                invited: invited, response: invited ? "needsAction" : nil, reminders: [], timeZone: nil, recurrence: nil
            )
        }
        // Around the current hour, so whatever time the tests run the grid opens on these blocks.
        let h = min(max(calendar.component(.hour, from: now), 3), 19)
        events = [
            event("e-standup", "Standup", at(0, h), at(0, h, 30), sphere: "s-work", call: "https://meet.google.com/abc-defg-hij"),
            event("e-focus", "Focus block", at(0, h + 1), at(0, h + 2, 30), sphere: "s-work"),
            event("e-lunch", "Lunch with Anna", at(0, h - 2), at(0, h - 1), sphere: nil, invited: true, location: "Café Riche"),
            event("e-gym", "Gym", at(0, h + 3), at(0, h + 4), sphere: "s-health"),
            event("e-review", "Design review", at(1, h), at(1, h + 1), sphere: "s-work"),
            event("e-dinner", "Dinner with family", at(1, h + 2), at(1, h + 4), sphere: "s-people"),
            event("e-trip", "Trip to the coast", day(3), day(4), sphere: "s-rest", allDay: true),
            event("e-yday", "Morning run", at(-1, 7), at(-1, 8), sphere: "s-health"),
        ]
    }

    func sync(_ request: SyncRequest) async throws -> SyncResponse {
        var applied: [String] = []
        var rejected: [SyncResponse.Rejected] = []
        for m in request.mutations {
            do {
                try apply(m)
                applied.append(m.mutationId)
            } catch {
                rejected.append(.init(mutationId: m.mutationId, reason: error.localizedDescription))
            }
        }
        clock += 1
        let stamp = clock
        func wrap<T>(_ items: [T], id: (T) -> String) -> [Envelope<T>] {
            items.map { Envelope(id: id($0), updatedAt: stamp, deleted: false, data: $0) }
        }
        let changes = SyncResponse.Changes(
            categories: wrap(spheres, id: \.id), activities: wrap(activities, id: \.id),
            projects: wrap(projects, id: \.id), tasks: wrap(tasks, id: \.id)
        )
        let since = Dictionary(uniqueKeysWithValues: ["categories", "activities", "projects", "tasks"].map { ($0, stamp) })
        return SyncResponse(changes: changes, since: since, applied: applied, rejected: rejected)
    }

    private func apply(_ m: Mutation) throws {
        guard m.model == "tasks" else { return }
        let decoder = JSONDecoder()
        switch m.kind {
        case "create":
            let data = try JSONEncoder().encode(m.data)
            tasks.append(try decoder.decode(TaskItem.self, from: data))
        case "update":
            guard let index = tasks.firstIndex(where: { $0.id == m.id }) else { throw BackendError.server("That task no longer exists.", status: 404) }
            var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(tasks[index])) as! [String: Any]
            let patch = try JSONSerialization.jsonObject(with: JSONEncoder().encode(m.patch)) as! [String: Any]
            for (key, value) in patch { object[key] = value }
            tasks[index] = try decoder.decode(TaskItem.self, from: JSONSerialization.data(withJSONObject: object))
        case "delete":
            tasks.removeAll { $0.id == m.id }
        default:
            break
        }
    }

    func events(from: Date, to: Date) async throws -> EventsPage {
        EventsPage(
            connected: true, needsReconnect: false, writeCalendarId: "acc::primary",
            events: events.filter { $0.end > from && $0.start < to }.sorted { $0.start < $1.start }
        )
    }

    func createEvent(_ body: [String: JSON]) async throws -> CalendarEvent {
        guard case .string(let s)? = body["start"], case .string(let e)? = body["end"],
              let start = ISO8601.date(from: s), let end = ISO8601.date(from: e)
        else { throw BackendError.server("start and end are required", status: 400) }
        var weights: [Weight] = []
        if case .array(let list)? = body["weights"] {
            for case .object(let w) in list {
                if case .string(let c)? = w["categoryId"], case .number(let p)? = w["weightPercent"] {
                    weights.append(Weight(categoryId: c, weightPercent: Int(p)))
                }
            }
        }
        if case .string(let activityId)? = body["activityId"], let activity = activities.first(where: { $0.id == activityId }) {
            weights = activity.weights
        }
        var title = ""
        if case .string(let t)? = body["title"] { title = t }
        var allDay = false
        if case .bool(let a)? = body["allDay"] { allDay = a }
        var projectId: String?
        if case .string(let p)? = body["projectId"] { projectId = p }
        let event = CalendarEvent(
            id: "e-\(UUID().uuidString.prefix(8).lowercased())", calendarId: "acc::primary", seriesId: nil, title: title,
            description: nil, start: start, end: end, allDay: allDay, declined: false, tentative: false, readOnly: false,
            movable: true, countsTowardHours: !weights.isEmpty, url: nil, mappingScope: weights.isEmpty ? nil : "instance",
            activityId: nil, activityName: nil, weights: weights, projectId: projectId, taskId: nil, endLocation: nil, notes: nil,
            location: nil, conferenceUrl: nil, conferenceName: nil, attendees: [], organizer: nil, invited: false,
            response: nil, reminders: [], timeZone: nil, recurrence: nil
        )
        events.append(event)
        return event
    }

    func patchEvent(id: String, _ body: [String: JSON]) async throws -> CalendarEvent {
        guard let index = events.firstIndex(where: { $0.id == id }) else { throw BackendError.server("That event is gone.", status: 404) }
        var e = events[index]
        if case .string(let t)? = body["title"] { e.title = t }
        if case .string(let s)? = body["start"], let d = ISO8601.date(from: s) { e.start = d }
        if case .string(let s)? = body["end"], let d = ISO8601.date(from: s) { e.end = d }
        if case .string(let s)? = body["location"] { e.location = s.isEmpty ? nil : s }
        if case .string(let s)? = body["description"] { e.description = s.isEmpty ? nil : s }
        if case .array(let r)? = body["recurrence"] {
            e.recurrence = r.compactMap { if case .string(let s) = $0 { return s } else { return nil } }
            e.seriesId = e.recurrence?.isEmpty == false ? e.id : nil
        }
        events[index] = e
        return e
    }

    func deleteEvent(id: String, _ body: [String: JSON]) async throws {
        events.removeAll { $0.id == id }
    }

    func respond(id: String, calendarId: String, response: String) async throws -> CalendarEvent {
        guard let index = events.firstIndex(where: { $0.id == id }) else { throw BackendError.server("That event is gone.", status: 404) }
        events[index].response = response
        events[index].declined = response == "declined"
        return events[index]
    }

    func setMapping(_ body: [String: JSON]) async throws {
        guard case .string(let id)? = body["externalEventId"], let index = events.firstIndex(where: { $0.id == id }) else { return }
        if case .array(let list)? = body["weights"] {
            events[index].weights = list.compactMap {
                guard case .object(let w) = $0, case .string(let c)? = w["categoryId"], case .number(let p)? = w["weightPercent"] else { return nil }
                return Weight(categoryId: c, weightPercent: Int(p))
            }
            events[index].activityId = nil
        }
        if let source = body["source"] {
            if case .string(let v) = source { events[index].source = v } else { events[index].source = nil }
        }
        if case .string(let a)? = body["activityId"], let activity = activities.first(where: { $0.id == a }) {
            events[index].weights = activity.weights
            events[index].activityId = a
            events[index].activityName = activity.name
        }
        if let p = body["projectId"] {
            if case .string(let v) = p { events[index].projectId = v } else { events[index].projectId = nil }
        }
        if let n = body["notes"] {
            if case .string(let v) = n { events[index].notes = v } else { events[index].notes = nil }
        }
        events[index].countsTowardHours = !events[index].weights.isEmpty
    }

    func calendars() async throws -> CalendarsResponse {
        CalendarsResponse(
            connected: true, needsReconnect: false,
            accounts: [CalendarAccount(accountId: "acc", email: "me@example.com", needsReconnect: false, calendars: [
                CalendarRef(id: "acc::primary", accountId: "acc", name: "me@example.com", color: "#3D5A80", primary: true, readOnly: false),
            ])],
            visibleCalendarIds: ["acc::primary"], writeCalendarId: "acc::primary"
        )
    }

    func setWriteCalendar(id: String) async throws {}

    func preferences() async throws -> Preferences { Preferences(reminders: .defaults) }

    func profile() async throws -> Profile { Profile(name: "Sample Person", email: "me@example.com", imageUrl: "") }

    func weekSummary(weekStart: Date) async throws -> WatchSummary {
        let weekEnd = weekStart.addingTimeInterval(7 * 86400)
        let week = events.filter { $0.start >= weekStart && $0.start < weekEnd && !$0.allDay }
        let categories = spheres.filter { !$0.isBuffer }.map { sphere in
            let hours = week.filter { $0.weights.contains { $0.categoryId == sphere.id } }
                .reduce(0.0) { $0 + $1.end.timeIntervalSince($1.start) / 3600 }
            return WatchCategory(id: sphere.id, name: sphere.name, color: sphere.color, icon: sphere.icon, targetHours: sphere.targetHoursPerWeek, actualHours: hours)
        }
        return WatchSummary(connected: true, needsReconnect: false, weekStart: weekStart, now: Date(), categories: categories, nextEvent: nil, active: nil)
    }

    func googleConnectURL() async throws -> URL { URL(string: "https://example.com")! }

    private var committed: Set<String> = []
    private var stars = 42

    func sessionSummary(slot: SessionSummary.Slot) async throws -> SessionSummary {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let reviewDay = slot == .morning ? calendar.date(byAdding: .day, value: -1, to: today)! : today
        let targetDay = slot == .morning ? today : calendar.date(byAdding: .day, value: 1, to: today)!
        func day(_ date: Date) -> SessionSummary.Day {
            let end = calendar.date(byAdding: .day, value: 1, to: date)!
            let blocks = events.filter { !$0.allDay && $0.start >= date && $0.start < end }.map { e in
                let sphere = e.weights.first.flatMap { w in spheres.first { $0.id == w.categoryId } }
                return SessionSummary.Block(
                    id: e.id, title: e.title, start: e.start, end: e.end, categoryId: sphere?.id, color: sphere?.color,
                    icon: sphere?.icon, hours: e.end.timeIntervalSince(e.start) / 3600
                )
            }
            let mapped = blocks.filter { $0.categoryId != nil }.reduce(0) { $0 + $1.hours }
            return SessionSummary.Day(
                day: DayString.string(date), planned: committed.contains(DayString.string(date)), rest: false,
                coverage: min(1, mapped / 4), mappedHours: mapped, budgetHours: 4, blocks: blocks,
                hours: blocks.reduce(0) { $0 + $1.hours }, categories: [], top: Array(blocks.prefix(4))
            )
        }
        let target = day(targetDay)
        return SessionSummary(
            slot: slot, today: DayString.string(today), connected: true,
            rank: .init(stars: stars, tier: 1, subtier: 2, toNextSubtier: 8), streak: 3, coverageThreshold: 0.7,
            award: target.planned ? [] : [.init(reason: "daily", delta: 3)], weeklyAward: 0,
            review: day(reviewDay), target: target, week: nil,
            copy: .init(title: "A day that went where you sent it", body: "The focus block held, and the evening is yours.", points: [])
        )
    }

    func commitDay(_ day: String, rest: Bool) async throws -> CommitResult {
        let already = committed.contains(day)
        committed.insert(day)
        if !already { stars += 3 }
        return CommitResult(alreadyPlanned: already, awarded: already ? [] : [.init(reason: "daily", delta: 3)], stars: stars)
    }

    func commitWeek(_ weekStart: String) async throws -> CommitResult {
        CommitResult(alreadyPlanned: false, awarded: [], stars: stars)
    }

    func sessionSlots() async throws -> (enabled: Bool, slots: [SessionSlot]) { (false, []) }

    func saveRecords(source: String, records: [(calendarId: String, eventId: String, data: JSON)]) async throws {
        for record in records {
            guard let index = events.firstIndex(where: { $0.id == record.eventId }) else { continue }
            events[index].record = record.data
        }
    }

    func watchTicket() async throws -> String { "fixture" }
}
