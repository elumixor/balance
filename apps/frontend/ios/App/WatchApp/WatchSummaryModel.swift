import Foundation
import BalanceKit

/// Everything the watch knows about the week, in one place. `GET /api/mobile/watch/summary` answers
/// the whole screen in a single call — the categories the ring is drawn from, the next event on the
/// bottom line, and whatever session the server thinks is running — so the watch makes one request
/// per appearance instead of one per band.
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

    var categories: [WatchCategory] { summary?.categories ?? [] }
    var nextEvent: NextEvent? { summary?.nextEvent }

    /// True only once an answer has arrived saying so — before the first response there is nothing
    /// to complain about, and a "connect a calendar" message on a cold start would be a lie.
    var needsCalendar: Bool {
        guard let summary else { return false }
        return !summary.connected || summary.needsReconnect
    }

    var hasLoaded: Bool { summary != nil }

    func refresh() async {
        if let preview = WatchPreview.summary {
            summary = preview
            return
        }
        do {
            summary = try await APIClient.shared.fetchWatchSummary()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

}
