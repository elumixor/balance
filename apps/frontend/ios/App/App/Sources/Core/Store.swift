import BalanceCore
import BalanceKit
import BalanceTelemetry
import Foundation
import Observation

/// Every screen's data for the session, and the only thing that talks to the API.
///
/// Screens read from here and call its verbs; none of them fetch. What they draw is what the
/// server last said with this device's unanswered writes applied on top, so a tap lands on screen
/// the moment it is made and the answer only ever corrects it. The last good copy is kept on disk
/// and drawn before the first request goes out, which is why the app opens on a week rather than a
/// spinner.
@MainActor
@Observable
final class Store {
    let backend: any Backend
    let calendar: Calendar

    // MARK: Records

    private(set) var spheres: [String: Sphere] = [:]
    private(set) var activities: [String: Activity] = [:]
    private(set) var projects: [String: Project] = [:]
    private(set) var tasks: [String: TaskItem] = [:]
    /// Events by the Monday their week starts on — the unit they are fetched and cached in.
    private(set) var weeks: [Date: [CalendarEvent]] = [:]
    private var fetchedAt: [Date: Date] = [:]
    private var inFlight: Set<Date> = []
    private var since: [String: Double] = [:]

    private(set) var connected = true
    private(set) var needsReconnect = false
    private(set) var writeCalendarId: String?
    private(set) var preferences = Preferences(reminders: .defaults)
    private(set) var profile: Profile?
    private(set) var loadedOnce = false

    /// The problems a person should hear about, newest last. `ProblemBanner` draws them.
    var problems: [Problem] = []

    /// Bumped whenever the event list moves, so reminders and the watch re-plan exactly once.
    private(set) var eventsVersion = 0

    struct Problem: Identifiable, Equatable {
        let id = UUID()
        let title: String
        let detail: String
    }

    init(backend: any Backend, calendar: Calendar = .current) {
        self.backend = backend
        var c = calendar
        c.firstWeekday = 2
        self.calendar = c
        restore()
    }

    // MARK: Derived

    var sphereList: [Sphere] {
        spheres.values.filter { !$0.isBuffer }.sorted { ($0.targetHoursPerWeek, $1.name) > ($1.targetHoursPerWeek, $0.name) }
    }

    var bufferSphere: Sphere? { spheres.values.first { $0.isBuffer } }

    var activeProjects: [Project] {
        projects.values.filter(\.isActive).sorted { ($0.ordinal, $0.name) < ($1.ordinal, $1.name) }
    }

    var vocabulary: Vocabulary {
        Vocabulary(
            // The buffer is offered last, but it is a sphere a line can name like any other.
            spheres: (sphereList + [bufferSphere].compactMap { $0 }).map { .init(id: $0.id, name: $0.name) },
            activities: activities.values.sorted { $0.name < $1.name }.map { .init(id: $0.id, name: $0.name) },
            projects: activeProjects.map { .init(id: $0.id, name: $0.name) }
        )
    }

    func weekStart(_ date: Date) -> Date {
        calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
    }

    /// Every event overlapping `[from, to)`, from whatever weeks are held.
    func events(from: Date, to: Date) -> [CalendarEvent] {
        var seen = Set<String>()
        var result: [CalendarEvent] = []
        var cursor = weekStart(from)
        while cursor < to {
            for event in weeks[cursor] ?? [] where event.end > from && event.start < to && seen.insert(event.key).inserted {
                result.append(event)
            }
            cursor = calendar.date(byAdding: .day, value: 7, to: cursor)!
        }
        return result.sorted { ($0.start, $0.end) < ($1.start, $1.end) }
    }

    func events(on day: Date) -> [CalendarEvent] {
        let start = calendar.startOfDay(for: day)
        return events(from: start, to: calendar.date(byAdding: .day, value: 1, to: start)!)
    }

    func event(key: String) -> CalendarEvent? {
        for list in weeks.values { if let e = list.first(where: { $0.key == key }) { return e } }
        return nil
    }

    func sphere(of event: CalendarEvent) -> Sphere? { event.sphere(in: spheres) }

    func hasWeek(_ date: Date) -> Bool { weeks[weekStart(date)] != nil }

    // MARK: Loading

    /// Everything a launch or a return to the app needs: the records, the weeks around today.
    func refresh() async {
        async let records: Void = syncRecords()
        async let side: Void = loadSideData()
        let today = Date()
        await ensureWeeks(around: today, force: true)
        _ = await (records, side)
        loadedOnce = true
        persist()
    }

    private func loadSideData() async {
        if let prefs = try? await backend.preferences() { preferences = prefs }
        if profile == nil, let p = try? await backend.profile() { profile = p }
    }

    /// The week holding `date` and the one either side of it, fetched if missing or older than
    /// a minute — so paging through the calendar costs a request only at the edges.
    func ensureWeeks(around date: Date, force: Bool = false) async {
        let center = weekStart(date)
        let starts = [-1, 0, 1].map { calendar.date(byAdding: .day, value: 7 * $0, to: center)! }
        let stale = starts.filter { start in
            guard !inFlight.contains(start) else { return false }
            if force { return true }
            guard let at = fetchedAt[start] else { return true }
            return Date().timeIntervalSince(at) > 60
        }
        guard let first = stale.min(), let last = stale.max() else { return }
        let end = calendar.date(byAdding: .day, value: 7, to: last)!
        stale.forEach { inFlight.insert($0) }
        defer { stale.forEach { inFlight.remove($0) } }
        do {
            let page = try await backend.events(from: first, to: end)
            connected = page.connected
            needsReconnect = page.needsReconnect
            if let id = page.writeCalendarId { writeCalendarId = id }
            var cursor = first
            while cursor < end {
                let next = calendar.date(byAdding: .day, value: 7, to: cursor)!
                weeks[cursor] = page.events.filter { $0.start < next && $0.end > cursor }
                fetchedAt[cursor] = Date()
                cursor = next
            }
            eventsVersion += 1
        } catch {
            report(error, "Couldn't load your calendar")
        }
    }

    // MARK: Synced records

    private var outbox: [Mutation] = []
    private var syncing = false
    private var syncAgain = false

    /// One round trip: the writes not yet acknowledged go up, everything that changed comes back.
    func syncRecords() async {
        if syncing {
            syncAgain = true
            return
        }
        syncing = true
        defer { syncing = false }
        repeat {
            syncAgain = false
            let sending = outbox
            do {
                let answer = try await backend.sync(SyncRequest(since: since, mutations: sending))
                let done = Set(answer.applied + answer.rejected.map(\.mutationId))
                outbox.removeAll { done.contains($0.mutationId) }
                merge(answer)
                for rejected in answer.rejected {
                    problems.append(Problem(title: "A change didn't save", detail: rejected.reason))
                }
                // A refused write was drawn ahead; forgetting it and pulling everything again
                // is the whole of undoing it.
                if !answer.rejected.isEmpty {
                    since = [:]
                    syncAgain = true
                }
            } catch {
                report(error, "Couldn't reach Balance")
                return
            }
        } while syncAgain
        persist()
    }

    private func merge(_ answer: SyncResponse) {
        func apply<T: Identifiable>(_ list: [Envelope<T>]?, into dict: inout [String: T]) where T.ID == String {
            for envelope in list ?? [] {
                if envelope.deleted { dict[envelope.id] = nil } else if let data = envelope.data { dict[envelope.id] = data }
            }
        }
        apply(answer.changes.categories, into: &spheres)
        apply(answer.changes.activities, into: &activities)
        apply(answer.changes.projects, into: &projects)
        apply(answer.changes.tasks, into: &tasks)
        // Replay what is still waiting, so a pull landing mid-edit can't undo the edit on screen.
        for mutation in outbox where mutation.model == "tasks" { replay(mutation) }
        since.merge(answer.since) { _, new in new }
    }

    private func replay(_ mutation: Mutation) {
        switch mutation.kind {
        case "create":
            if let data = mutation.data, let task = decode(TaskItem.self, data) { tasks[task.id] = task }
        case "update":
            guard let task = tasks[mutation.id], let patch = mutation.patch else { return }
            if let merged = patched(task, patch) { tasks[task.id] = merged }
        case "delete":
            tasks[mutation.id] = nil
        default: break
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: JSON) -> T? {
        guard let data = try? JSONEncoder().encode(json) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func patched(_ task: TaskItem, _ patch: JSON) -> TaskItem? {
        guard case .object(var base) = JSON.encode(task), case .object(let changes) = patch else { return nil }
        for (key, value) in changes { base[key] = value }
        return decode(TaskItem.self, .object(base))
    }

    private func enqueue(_ mutation: Mutation) {
        outbox.append(mutation)
        replay(mutation)
        Task { await syncRecords() }
    }

    // MARK: Tasks

    @discardableResult
    func createTask(title: String, projectId: String, day: Date?) -> TaskItem {
        let siblings = tasks.values.filter { $0.projectId == projectId && $0.parentId == nil }
        let task = TaskItem(
            id: UUID().uuidString.lowercased(), projectId: projectId, stageId: nil, parentId: nil, title: title,
            description: "", status: "todo", statusLabel: "", priority: nil,
            startsOn: nil, endsOn: day.map(DayString.string), assigneeIds: [], estimateHours: nil,
            ordinal: siblings.count, notionUrl: nil
        )
        enqueue(Mutation(mutationId: UUID().uuidString, kind: "create", model: "tasks", id: task.id, data: JSON.encode(task)))
        Telemetry.event("task_created", ["from": "typed"])
        return task
    }

    func updateTask(_ id: String, _ patch: [String: JSON]) {
        enqueue(Mutation(mutationId: UUID().uuidString, kind: "update", model: "tasks", id: id, patch: .object(patch)))
    }

    /// To-dos ticked off since launch stay in the list, crossed out, so a mis-tap can be undone.
    private(set) var ticked: Set<String> = []

    func setDone(_ task: TaskItem, _ done: Bool) {
        if done { ticked.insert(task.id) }
        updateTask(task.id, ["status": .string(done ? "done" : "todo"), "statusLabel": .string("")])
    }

    func deleteTask(_ task: TaskItem) {
        enqueue(Mutation(mutationId: UUID().uuidString, kind: "delete", model: "tasks", id: task.id))
    }

    // MARK: Events

    private func put(_ event: CalendarEvent, replacing key: String? = nil) {
        let removing = key ?? event.key
        for start in weeks.keys { weeks[start]?.removeAll { $0.key == removing || $0.key == event.key } }
        var cursor = weekStart(event.start)
        while cursor < event.end || cursor == weekStart(event.start) {
            weeks[cursor, default: []].append(event)
            cursor = calendar.date(byAdding: .day, value: 7, to: cursor)!
        }
        eventsVersion += 1
    }

    private func drop(_ key: String) {
        for start in weeks.keys { weeks[start]?.removeAll { $0.key == key } }
        eventsVersion += 1
    }

    struct NewEvent {
        var title: String
        var start: Date
        var end: Date
        var allDay = false
        var sphereId: String?
        var activityId: String?
        var projectId: String?
        var recurrence: String?
    }

    /// Draws the block at once, writes it, and swaps the drawn one for what the calendar made.
    @discardableResult
    func createEvent(_ new: NewEvent) async -> CalendarEvent? {
        var weights: [Weight] = []
        if let activity = new.activityId.flatMap({ activities[$0] }) {
            weights = activity.weights
        } else if let sphere = new.sphereId ?? new.projectId.flatMap({ projects[$0]?.categoryId }) {
            weights = [Weight(categoryId: sphere, weightPercent: 100)]
        }
        let draft = CalendarEvent(
            id: "draft-\(UUID().uuidString)", calendarId: writeCalendarId ?? "", seriesId: nil, title: new.title,
            description: nil, start: new.start, end: new.end, allDay: new.allDay, declined: false, tentative: false,
            readOnly: false, movable: false, countsTowardHours: !weights.isEmpty, url: nil, mappingScope: nil,
            activityId: new.activityId, activityName: nil, weights: weights, projectId: new.projectId, taskId: nil,
            endLocation: nil, notes: nil, location: nil, conferenceUrl: nil, conferenceName: nil, attendees: [],
            organizer: nil, invited: false, response: nil, reminders: [], timeZone: nil, recurrence: nil
        )
        put(draft)
        var body: [String: JSON] = [
            "title": .string(new.title), "start": .string(ISO8601.string(from: new.start)),
            "end": .string(ISO8601.string(from: new.end)),
        ]
        if new.allDay { body["allDay"] = .bool(true) }
        if let id = new.activityId {
            body["activityId"] = .string(id)
        } else if !weights.isEmpty {
            body["weights"] = .array(weights.map { .object(["categoryId": .string($0.categoryId), "weightPercent": .number(Double($0.weightPercent))]) })
        }
        if let projectId = new.projectId { body["projectId"] = .string(projectId) }
        do {
            var created = try await backend.createEvent(body)
            if let rule = new.recurrence {
                created = try await backend.patchEvent(id: created.id, ["calendarId": .string(created.calendarId), "recurrence": .array([.string(rule)])])
                // A series is fetched back as occurrences; the week is simply asked again.
                drop(draft.key)
                await ensureWeeks(around: new.start, force: true)
            } else {
                put(created, replacing: draft.key)
            }
            Telemetry.event("event_created", ["from": "typed"])
            return created
        } catch {
            drop(draft.key)
            report(error, "Couldn't add “\(new.title)”")
            return nil
        }
    }

    enum SeriesScope: String { case this, following, all }

    /// Changes an event's own fields — time, title, place — on the calendar.
    @discardableResult
    func patch(_ event: CalendarEvent, _ fields: [String: JSON], scope: SeriesScope = .this, draw: ((inout CalendarEvent) -> Void)? = nil) async -> Bool {
        var drawn = event
        draw?(&drawn)
        put(drawn, replacing: event.key)
        var body = fields
        body["calendarId"] = .string(event.calendarId)
        if scope != .this, let series = event.seriesId {
            body["seriesId"] = .string(series)
            body["seriesScope"] = .string(scope == .all ? "all" : "following")
            body["previousStart"] = .string(ISO8601.string(from: event.start))
            body["previousEnd"] = .string(ISO8601.string(from: event.end))
        }
        do {
            let updated = try await backend.patchEvent(id: event.id, body)
            if scope == .this { put(updated, replacing: drawn.key) } else { await ensureWeeks(around: event.start, force: true) }
            return true
        } catch {
            put(event, replacing: drawn.key)
            report(error, "Couldn't change “\(event.title)”")
            return false
        }
    }

    func move(_ event: CalendarEvent, start: Date, end: Date) async {
        await patch(event, ["start": .string(ISO8601.string(from: start)), "end": .string(ISO8601.string(from: end))]) {
            $0.start = start
            $0.end = end
        }
    }

    func delete(_ event: CalendarEvent, scope: SeriesScope = .this) async {
        drop(event.key)
        var body: [String: JSON] = ["calendarId": .string(event.calendarId)]
        if let series = event.seriesId {
            if scope == .this {
                body["occurrenceOf"] = .string(series)
            } else {
                body["seriesId"] = .string(series)
                body["seriesScope"] = .string(scope == .all ? "all" : "following")
                body["occurrenceStart"] = .string(ISO8601.string(from: event.start))
            }
        }
        do {
            try await backend.deleteEvent(id: event.id, body)
            if scope != .this { await ensureWeeks(around: event.start, force: true) }
            Telemetry.event("event_deleted")
        } catch {
            put(event)
            report(error, "Couldn't delete “\(event.title)”")
        }
    }

    func respond(_ event: CalendarEvent, _ response: String) async {
        var drawn = event
        drawn.response = response
        drawn.declined = response == "declined"
        put(drawn, replacing: event.key)
        do {
            put(try await backend.respond(id: event.id, calendarId: event.calendarId, response: response), replacing: drawn.key)
        } catch {
            put(event, replacing: drawn.key)
            report(error, "Couldn't send your answer")
        }
    }

    /// What an hour counts as, or what it was for. `fields` are the mapping's own: `activityId`,
    /// `weights`, `projectId`, `notes`. A block that counts as nothing is first made to count as
    /// the project's sphere or the buffer, the same rule the web card follows.
    func map(_ event: CalendarEvent, _ fields: [String: JSON], draw: (inout CalendarEvent) -> Void) async {
        var drawn = event
        draw(&drawn)
        put(drawn, replacing: event.key)
        let scope = event.mappingScope ?? (event.seriesId == nil ? "instance" : "series")
        var body = fields
        body["calendarId"] = .string(event.calendarId)
        body["externalEventId"] = .string(scope == "series" ? (event.seriesId ?? event.id) : event.id)
        body["scope"] = .string(scope)
        if fields["weights"] == nil, fields["activityId"] == nil, event.weights.isEmpty {
            let projectSphere: String? = {
                if case .string(let id)? = fields["projectId"] { return projects[id]?.categoryId }
                return nil
            }()
            if let sphere = projectSphere ?? bufferSphere?.id {
                body["weights"] = .array([.object(["categoryId": .string(sphere), "weightPercent": .number(100)])])
                drawn.weights = [Weight(categoryId: sphere, weightPercent: 100)]
                put(drawn, replacing: drawn.key)
            }
        }
        do {
            try await backend.setMapping(body)
            if scope == "series" { await ensureWeeks(around: event.start, force: true) }
        } catch {
            put(event, replacing: drawn.key)
            report(error, "Couldn't save that")
        }
    }

    func setSphere(_ event: CalendarEvent, sphereId: String) async {
        await map(event, ["weights": .array([.object(["categoryId": .string(sphereId), "weightPercent": .number(100)])])]) {
            $0.weights = [Weight(categoryId: sphereId, weightPercent: 100)]
            $0.activityId = nil
            $0.activityName = nil
            $0.countsTowardHours = true
        }
    }

    func setActivity(_ event: CalendarEvent, activityId: String) async {
        guard let activity = activities[activityId] else { return }
        await map(event, ["activityId": .string(activityId)]) {
            $0.weights = activity.weights
            $0.activityId = activityId
            $0.activityName = activity.name
            $0.countsTowardHours = true
        }
    }

    // MARK: Calendars and account

    func calendars() async -> CalendarsResponse? {
        do { return try await backend.calendars() } catch {
            report(error, "Couldn't load your calendars")
            return nil
        }
    }

    func setWriteCalendar(_ id: String) async {
        do {
            try await backend.setWriteCalendar(id: id)
            writeCalendarId = id
        } catch { report(error, "Couldn't change the calendar") }
    }

    // MARK: Problems

    func report(_ error: Error, _ title: String) {
        if (error as? URLError)?.code == .cancelled || error is CancellationError { return }
        Telemetry.capture(error, context: title)
        let detail = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        NSLog("Balance problem: %@ — %@ (%@)", title, detail, String(describing: error))
        // One card per failure, but not the same failure stacked while the network is down.
        if problems.last?.title == title, problems.last?.detail == detail { return }
        problems.append(Problem(title: title, detail: detail))
        if problems.count > 3 { problems.removeFirst(problems.count - 3) }
    }

    func dismiss(_ problem: Problem) { problems.removeAll { $0.id == problem.id } }

    // MARK: Disk

    private struct Snapshot: Codable {
        var spheres: [Sphere]
        var activities: [Activity]
        var projects: [Project]
        var tasks: [TaskItem]
        var events: [CalendarEvent]
        var since: [String: Double]
        var writeCalendarId: String?
    }

    private var snapshotURL: URL? {
        guard backend is LiveBackend else { return nil }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("balance-snapshot.json")
    }

    private func restore() {
        guard let url = snapshotURL, let data = try? Data(contentsOf: url),
              let snapshot = try? LiveBackend.decoder.decode(Snapshot.self, from: data)
        else { return }
        spheres = Dictionary(uniqueKeysWithValues: snapshot.spheres.map { ($0.id, $0) })
        activities = Dictionary(uniqueKeysWithValues: snapshot.activities.map { ($0.id, $0) })
        projects = Dictionary(uniqueKeysWithValues: snapshot.projects.map { ($0.id, $0) })
        tasks = Dictionary(uniqueKeysWithValues: snapshot.tasks.map { ($0.id, $0) })
        since = snapshot.since
        writeCalendarId = snapshot.writeCalendarId
        for event in snapshot.events { put(event) }
        // A restored week is drawn but never trusted: every one of them is fetched again.
        fetchedAt = [:]
    }

    func persist() {
        guard let url = snapshotURL else { return }
        let today = Date()
        let snapshot = Snapshot(
            spheres: Array(spheres.values), activities: Array(activities.values), projects: Array(projects.values),
            tasks: Array(tasks.values),
            events: events(from: calendar.date(byAdding: .day, value: -14, to: today)!, to: calendar.date(byAdding: .day, value: 21, to: today)!)
                .filter { !$0.id.hasPrefix("draft-") },
            since: since, writeCalendarId: writeCalendarId
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(ISO8601.string(from: date))
        }
        guard let data = try? encoder.encode(snapshot) else { return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic)
    }

    /// Signing out forgets everything this device held about the account.
    func wipe() {
        spheres = [:]
        activities = [:]
        projects = [:]
        tasks = [:]
        weeks = [:]
        fetchedAt = [:]
        since = [:]
        outbox = []
        profile = nil
        loadedOnce = false
        if let url = snapshotURL { try? FileManager.default.removeItem(at: url) }
    }
}
