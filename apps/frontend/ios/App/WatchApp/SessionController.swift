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
@MainActor
@Observable
final class SessionController {
    private(set) var active: ActiveSession?
    private(set) var isBusy = false
    var errorMessage: String?

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

    init(active: ActiveSession? = nil) {
        self.active = active
        self.confirmed = active
    }

    var isRunning: Bool { active != nil }

    // MARK: - Reading

    func refresh() async {
        do {
            let session = try await APIClient.shared.fetchCurrentSession()
            confirm(session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// The summary call already carries the running session, so a screen that just fetched it can
    /// hand it over instead of asking again. The session half is ignored while a write is in
    /// flight — the answer we are waiting on is newer than this one — but the week it describes is
    /// taken either way, since nothing else is racing for it.
    func apply(summary: WatchSummary) {
        week = summary
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
        TrackingAlarm.playConfirmation()
        await perform {
            try await APIClient.shared.startTracking(
                categoryId: category.id,
                durationMinutes: durationMinutes,
                title: title
            )
        }
    }

    func stop() async {
        guard active != nil else { return }
        ticks = TrackingPlan(minutes: 0, ticks: .off)
        active = nil
        TrackingAlarm.playConfirmation()
        await perform { _ = try await APIClient.shared.stopTracking(); return nil }
    }

    /// `minutes` is the session's whole length measured from where it started, which is what the
    /// backend stores — the "+15 min" button on screen adds to the current length before calling.
    func extend(minutes: Int) async {
        if let current = active {
            active = ActiveSession(
                id: current.id,
                categoryId: current.categoryId,
                categoryName: current.categoryName,
                categoryColor: current.categoryColor,
                categoryIcon: current.categoryIcon,
                eventId: current.eventId,
                calendarId: current.calendarId,
                startedAt: current.startedAt,
                plannedEndAt: current.startedAt.addingTimeInterval(TimeInterval(minutes * 60))
            )
        }
        await perform { try await APIClient.shared.extendTracking(durationMinutes: minutes) }
    }

    /// Adds to whatever the session is currently planned to run for. Open-ended sessions count
    /// from now, since they have no planned end to add to.
    func extendBy(minutes: Int) async {
        guard let current = active else { return }
        let plannedSoFar = current.plannedEndAt.map { $0.timeIntervalSince(current.startedAt) }
            ?? Date().timeIntervalSince(current.startedAt)
        let total = Int((plannedSoFar / 60).rounded()) + minutes
        await extend(minutes: max(total, 1))
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
            confirm(try await work())
        } catch {
            errorMessage = error.localizedDescription
            active = confirmed
            publish()
        }
    }

    private func confirm(_ session: ActiveSession?) {
        confirmed = session
        active = session
        publish()
    }

    /// The complication and the alarm both live outside this process, so they are refreshed on
    /// every change rather than polled. The session written is this controller's, not the summary's,
    /// so an optimistic start reaches the watch face at once instead of waiting for the next
    /// refresh to confirm it. Before any summary has arrived the week already in the blob is left
    /// where it is, so a session started on a cold launch doesn't blank the complication's ring.
    private func publish() {
        let base = week.map(WatchSnapshot.init(summary:)) ?? WatchSharedState.load()
        let snapshot = WatchSnapshot(
            categories: base?.categories ?? [],
            nextEvent: base?.nextEvent,
            active: active.map(SnapshotSession.init(session:)),
            updatedAt: Date()
        )
        WatchSharedState.save(snapshot)
        WidgetCenter.shared.reloadAllTimelines()

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
