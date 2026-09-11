import Foundation
import BalanceKit

/// Everything the watch knows about the week, in one place. `GET /api/mobile/watch/summary` answers
/// the whole screen in a single call — the categories the ring is drawn from, everything coming up,
/// and whatever session the server thinks is running — so the watch makes one request per
/// appearance instead of one per band.
///
/// The last answer is kept on disk (`WatchCache`) and read back before the first request goes out,
/// which is what makes the app work out of range: a wrist that cannot reach the server still has a
/// ring to drag, categories to start a timer against, and the events it was told about earlier.
/// `isStale` is the one thing the screen does with that — the data is drawn exactly the same, with
/// a mark saying it is from before.
///
/// This model only fetches. The App Group blob the widget reads carries a session as well, and the
/// session that is true right now is the one `SessionController` holds — which may be an optimistic
/// one the server has not confirmed yet — so the controller owns the blob and this hands it each
/// summary as it arrives.
@MainActor
@Observable
final class WatchSummaryModel {
    private(set) var summary: WatchSummary?
    var errorMessage: String?

    /// True while what is on screen came off the disk rather than off the wire. Cleared by the
    /// first answer that arrives, set again by the first request that fails without one.
    private(set) var isStale = false

    var categories: [WatchCategory] { summary?.categories ?? [] }
    var nextEvent: NextEvent? { summary?.nextEvent }
    var events: [NextEvent] { summary?.events ?? [] }

    /// True only once an answer has arrived saying so — before the first response there is nothing
    /// to complain about, and a "connect a calendar" message on a cold start would be a lie.
    var needsCalendar: Bool {
        guard let summary else { return false }
        return !summary.connected || summary.needsReconnect
    }

    var hasLoaded: Bool { summary != nil }

    init() {
        // Read before anything is asked for, so the first frame is the week rather than a blank
        // ring. A cache older than the request that is about to replace it costs nothing.
        if !WatchPreview.isEnabled, let cached = WatchCache.load() {
            summary = cached
            isStale = true
        }
    }

    func refresh() async {
        if let preview = WatchPreview.summary {
            summary = preview
            return
        }
        do {
            let fresh = try await APIClient.shared.fetchWatchSummary()
            summary = fresh
            isStale = false
            errorMessage = nil
            WatchCache.save(fresh)
        } catch {
            // Out of range is not a failure worth a sentence — the week on screen is the week from
            // a moment ago, and saying so with a mark is both truer and quieter than an error.
            if isOfflineFailure(error) {
                isStale = true
                errorMessage = nil
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }
}
