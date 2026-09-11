import Foundation
import BalanceKit
import WidgetKit

/// Owns the one session the watch can have running. Every screen that starts, extends or finishes
/// a session goes through here, so there is a single answer to "what is running right now" and a
/// single place that keeps the widget's App Group blob and the alarm in step with the server.
///
/// The watch is used in glances of a couple of seconds, so the writes are optimistic: the UI flips
/// to the new state before the request comes back and is then reconciled with whatever the server
/// actually stored. If the request fails, the optimistic state is rolled back to the last answer
/// we trust and the error is surfaced.
/// The question asked once a timer has ended: was it for something already on the calendar? The
/// best candidate is the one offered; the rest are there for a screen with room for a list.
struct MatchPrompt: Identifiable, Equatable {
    let session: ActiveSession
    let candidates: [MatchCandidate]

    var id: String { session.id }
    var best: MatchCandidate { candidates[0] }
}

@MainActor
@Observable
final class SessionController {
    /// One controller for the process: the screen and the notification delegate both start and
    /// stop sessions, and a "start timer" tapped on a reminder has to land on the same session
    /// the screen is drawing.
    static let shared = SessionController()

    private(set) var active: ActiveSession?
    private(set) var isBusy = false
    var errorMessage: String?

    /// True while the running timer is the watch's own — started with no signal, so nothing else
    /// knows about it yet. It is not an error state: the session runs, ticks and ends exactly as
    /// any other, and is written to the calendar as one finished block once there is a connection.
    private(set) var isLocal = false

    /// Set when a stop comes back with something to ask, cleared by answering it either way.
    var pendingMatch: MatchPrompt?

    /// The last state the server confirmed. Optimistic edits never touch it, so a failed request
    /// has something honest to fall back to.
    private var confirmed: ActiveSession?

    /// The week the last summary described. The App Group blob carries it alongside the session,
    /// and this controller is the only writer of that blob, so it has to hold both halves.
    private var week: WatchSummary?

    /// How the running session was asked to be broken up. A session found already running — one
    /// started on the phone, or before the app was last closed — has no rhythm we know of, so it
    /// simply doesn't tick.
    private var ticks = TrackingPlan(minutes: 0, ticks: .off)

    /// The title a locally-run session's block should carry, and the event it was run for. Kept
    /// beside the session because the write that finally records it happens long after the screen
    /// that knew any of this has gone.
    private var localTitle: String?
    private var localEvent: (id: String, calendarId: String)?

    init(active: ActiveSession? = nil) {
        self.active = active
        self.confirmed = active
        // A session started out of range has to survive the app being killed: a watch is put down
        // mid-run and picked up an hour later more often than it is watched.
        if active == nil, let stored = LocalSession.load() {
            self.active = stored.session
            isLocal = true
            ticks = stored.ticks
            localTitle = stored.title
            localEvent = stored.eventId.flatMap { id in stored.calendarId.map { (id, $0) } }
        }
    }

    var isRunning: Bool { active != nil }

    // MARK: - Reading

    func refresh() async {
        do {
            let session = try await APIClient.shared.fetchCurrentSession()
            confirm(session)
        } catch {
            report(error)
        }
    }

    /// The summary call already carries the running session, so a screen that just fetched it can
    /// hand it over instead of asking again. The session half is ignored while a write is in
    /// flight — the answer we are waiting on is newer than this one — but the week it describes is
    /// taken either way, since nothing else is racing for it.
    func apply(summary: WatchSummary) {
        week = summary
        // A session the server has never heard of is not contradicted by the server not mentioning
        // it. Only the write that records it ends it.
        if isLocal {
            publish()
            return
        }
        // Sample data never carries a session, so a preview run keeps whatever it started itself.
        if !isBusy, !(WatchPreview.isEnabled && active != nil) {
            confirmed = summary.active
            active = summary.active
        }
        publish()
    }

    // MARK: - Writing

    /// Starts a session with everything needed to show it immediately; the category is only used
    /// for the optimistic placeholder, the server decides the real session.
    ///
    /// The ticks are the watch's own business — nothing about being nudged part-way through belongs
    /// in the calendar — so they are kept here and re-scheduled from `publish` alongside the alarm.
    func start(category: WatchCategory, plan: TrackingPlan, title: String? = nil) async {
        ticks = plan
        let durationMinutes = plan.duration.minutes
        let placeholder = ActiveSession(
            id: "pending",
            categoryId: category.id,
            categoryName: category.name,
            categoryColor: category.color,
            categoryIcon: category.icon,
            eventId: "",
            calendarId: "",
            startedAt: Date(),
            plannedEndAt: durationMinutes.map { Date().addingTimeInterval(TimeInterval($0 * 60)) }
        )
        active = placeholder
        localTitle = title
        localEvent = nil
        TrackingAlarm.playConfirmation()
        await perform {
            try await APIClient.shared.startTracking(
                categoryId: category.id,
                durationMinutes: durationMinutes,
                title: title
            )
        }
    }

    /// A timer for something already planned — the reminder's "start timer". It runs against the
    /// event itself rather than writing a second one, for the event's own length and rhythm.
    func start(for event: NextEvent) async {
        guard let categoryId = event.categoryId else { return }
        let category = WatchCategory(
            id: categoryId,
            name: event.categoryName ?? event.title,
            color: event.categoryColor ?? "#888888",
            icon: event.categoryIcon ?? "",
            targetHours: 0,
            actualHours: 0
        )
        let plan = TrackingPlan(event: event)
        ticks = plan
        // Measured from now rather than from the event's start: a timer started a few minutes in
        // still gets the whole length it was asked for, and the server plans the end the same way.
        let placeholder = ActiveSession(
            id: "pending",
            categoryId: categoryId,
            categoryName: category.name,
            categoryColor: category.color,
            categoryIcon: category.icon,
            eventId: event.id,
            calendarId: event.calendarId,
            startedAt: Date(),
            plannedEndAt: Date().addingTimeInterval(TimeInterval(plan.minutes * 60))
        )
        active = placeholder
        localTitle = event.title
        localEvent = (event.id, event.calendarId)
        TrackingAlarm.playConfirmation()
        await perform {
            try await APIClient.shared.startTracking(
                categoryId: categoryId,
                durationMinutes: plan.minutes,
                eventId: event.id,
                calendarId: event.calendarId
            )
        }
    }

    /// Ends the session now. `alerting` is for the end arriving on its own — a session the user
    /// stopped by hand needs no more than the tap's own click, one that ran out needs to be felt.
    ///
    /// What comes back may carry a question — was this for the thing already on the calendar? —
    /// which is left in `pendingMatch` for the screen to ask, since the controller outlives it and
    /// the stop may have been waited out with the wrist down.
    func stop(alerting: Bool = false) async {
        guard let ending = active else { return }
        let endedAt = Date()
        let wasLocal = isLocal
        let title = localTitle
        let event = localEvent
        ticks = TrackingPlan(minutes: 0, ticks: .off)
        active = nil
        isLocal = false
        localTitle = nil
        localEvent = nil
        stopWatchingForEnd()
        if alerting { TrackingAlarm.playCompletion() } else { TrackingAlarm.playConfirmation() }

        // A session the server never heard of is told as one finished block rather than as a start
        // it has already missed. The queue sends it now if there is a signal and the next time
        // there is one if there isn't, so this path is the same whether the network came back a
        // minute ago or hasn't yet.
        if wasLocal {
            publish()
            PendingWrites.shared.enqueue(
                .logged(
                    id: UUID(), categoryId: ending.categoryId, startedAt: ending.startedAt,
                    endedAt: endedAt, title: title, eventId: event?.id, calendarId: event?.calendarId
                )
            )
            await PendingWrites.shared.flush()
            return
        }

        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            let result = try await APIClient.shared.stopTracking(at: endedAt)
            confirm(nil)
            if let stopped = result.stopped, !result.candidates.isEmpty {
                pendingMatch = MatchPrompt(session: stopped, candidates: result.candidates)
            }
        } catch {
            // Out of range, the session is still over: it ended when the finger said it did, and
            // the queue carries that moment so the hours don't grow while the watch is away.
            if isOfflineFailure(error) {
                confirm(nil)
                PendingWrites.shared.enqueue(.stopped(id: UUID(), at: endedAt))
                return
            }
            report(error)
            // A rollback to `confirmed` normally undoes the optimistic edit, but here that would
            // hand the end watcher the same (already past) `plannedEndAt` it just fired on, so it
            // fires `stop()` again immediately — a haptic-and-view-flip loop that never stops as
            // long as the request keeps failing. A session whose planned end is already behind us
            // stays finished regardless of what the request answered.
            if let session = confirmed, let end = session.plannedEndAt, end <= Date() {
                active = nil
            } else {
                active = confirmed
            }
            publish()
        }
    }

    /// The answer to the pending question. "Yes" folds the timer into the planned event; "no"
    /// leaves the timer's own event where it is, which is already the right week.
    func answerMatch(with candidate: MatchCandidate?) async {
        guard let prompt = pendingMatch else { return }
        pendingMatch = nil
        guard let candidate else { return }
        if WatchPreview.isEnabled { return }
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            _ = try await APIClient.shared.matchTracking(
                sessionId: prompt.session.id, calendarId: candidate.calendarId, eventId: candidate.id
            )
        } catch {
            guard isOfflineFailure(error) else { return report(error) }
            PendingWrites.shared.enqueue(
                .matched(
                    id: UUID(), sessionId: prompt.session.id,
                    calendarId: candidate.calendarId, eventId: candidate.id
                )
            )
        }
    }

    // MARK: - Plumbing

    private func perform(_ work: @escaping () async throws -> ActiveSession?) async {
        // Nothing is written while the app is running on sample data: the optimistic state it just
        // set is the whole truth, and the server would only answer that nobody is signed in.
        if WatchPreview.isEnabled {
            confirmed = active
            publish()
            return
        }

        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            isLocal = false
            confirm(try await work())
        } catch {
            // The whole of "a timer works out of range": the optimistic session is not rolled
            // back, it is kept as the watch's own and recorded when the stop can be sent.
            if isOfflineFailure(error) {
                isLocal = active != nil
                publish()
                return
            }
            report(error)
            active = confirmed
            publish()
        }
    }

    private func confirm(_ session: ActiveSession?) {
        confirmed = session
        active = session
        publish()
    }

    /// A cancelled request is not something that went wrong — it is this app deciding it no longer
    /// wants the answer — and "cancelled" on the screen only ever reads as a failure that isn't one.
    private func report(_ error: Error) {
        if error is CancellationError { return }
        if let error = error as? URLError, error.code == .cancelled { return }
        errorMessage = error.localizedDescription
    }

    /// The end of a fixed session, watched here rather than by a view.
    ///
    /// A view's `.task(id:)` keyed on the planned end is torn down the instant the session it was
    /// keyed on changes — which is the first thing finishing does — so the stop request it had just
    /// started died in flight, the server was never told, and the screen said "cancelled". The
    /// controller outlives every screen, so the wait belongs to it.
    private var endWatcher: Task<Void, Never>?
    private var watchedEnd: Date?

    /// Restarted only when the planned end actually moves, so the frequent re-publishes don't keep
    /// resetting a wait that is already counting down to the right moment.
    private func watchForEnd() {
        let end = active?.plannedEndAt
        guard end != watchedEnd else { return }
        endWatcher?.cancel()
        watchedEnd = end
        guard let end else { endWatcher = nil; return }

        endWatcher = Task { [weak self] in
            let wait = end.timeIntervalSinceNow
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled else { return }
            guard let self, active?.plannedEndAt == end else { return }
            // Let go of this task before finishing: `stop` cancels whatever is watching, and this
            // is it — cancelling the task the stop request is running in is how the request used to
            // die halfway. Nothing is left to cancel by the time it asks.
            endWatcher = nil
            watchedEnd = nil
            await stop(alerting: true)
        }
    }

    private func stopWatchingForEnd() {
        endWatcher?.cancel()
        endWatcher = nil
        watchedEnd = nil
    }

    /// The complication and the alarm both live outside this process, so they are refreshed on
    /// every change rather than polled. The session written is this controller's, not the summary's,
    /// so an optimistic start reaches the watch face at once instead of waiting for the next
    /// refresh to confirm it. Before any summary has arrived the week already in the blob is left
    /// where it is, so a session started on a cold launch doesn't blank the complication's ring.
    private func publish() {
        // Written on every change rather than only at the start, because the plan and the ticks
        // can move under a running session and what comes back after a relaunch has to be the
        // session as it stands, not as it was begun.
        LocalSession.save(
            isLocal && active != nil
                ? LocalSession.Stored(
                    session: active!, ticks: ticks, title: localTitle,
                    eventId: localEvent?.id, calendarId: localEvent?.calendarId
                )
                : nil
        )

        let base = week.map(WatchSnapshot.init(summary:)) ?? WatchSharedState.load()
        let snapshot = WatchSnapshot(
            categories: base?.categories ?? [],
            nextEvent: base?.nextEvent,
            active: active.map(SnapshotSession.init(session:)),
            updatedAt: Date()
        )
        WatchSharedState.save(snapshot)
        WidgetCenter.shared.reloadAllTimelines()
        watchForEnd()

        guard let session = active else {
            TrackingAlarm.cancel()
            return
        }

        // Ticks are measured from where the session actually started, not from now, so a re-publish
        // part-way through puts the remaining ones back where they always were.
        TrackingAlarm.schedule(
            categoryName: session.categoryName,
            endingAt: session.plannedEndAt,
            ticksAt: ticks.tickOffsets.map { session.startedAt.addingTimeInterval($0) },
            repeatingEvery: session.plannedEndAt == nil ? ticks.repeatingTickInterval : nil
        )
    }
}
