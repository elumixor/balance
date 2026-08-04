import Foundation
import BalanceKit
import WidgetKit

/// Drives the main tracking screen: running-entry state, quick-start choices, start/stop.
///
/// Every state change is also published to the shared App Group (``WatchSharedState``) and
/// followed by a WidgetKit reload, so the Balance Watch Widget reflects the new state
/// immediately instead of waiting for its own timeline refresh budget.
@MainActor
@Observable
final class TrackingViewModel {
    private(set) var runningEntry: Entry?
    private(set) var quickActivities: [ActivityRef] = []
    private(set) var isLoading = false
    var errorMessage: String?

    private var isBusy = false

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let running = try await APIClient.shared.fetchRunningEntry()
            runningEntry = running
            if running == nil {
                let trackData = try await APIClient.shared.fetchTrackData(limit: 20)
                quickActivities = Self.mergeQuickActivities(
                    recent: trackData.recentActivities,
                    frequent: trackData.frequentActivities
                )
            }
            publishSharedState(running: running)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Starts tracking `activity` immediately — no confirmation, this is a one-tap action.
    func start(_ activity: ActivityRef) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await APIClient.shared.startTimer(activityId: activity.id)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Stops the running timer immediately — no confirmation, this is a one-tap action.
    func stop() async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await APIClient.shared.stopTimer()
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func publishSharedState(running: Entry?) {
        if let running {
            WatchSharedState.save(
                TrackingSnapshot(activityId: running.activityId, activityName: running.activityName, startedAt: running.startedAt)
            )
        } else {
            WatchSharedState.save(nil)
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    private static func mergeQuickActivities(recent: [ActivityRef], frequent: [ActivityRef]) -> [ActivityRef] {
        var seen = Set<String>()
        var result: [ActivityRef] = []
        for activity in recent + frequent {
            guard seen.insert(activity.id).inserted else { continue }
            result.append(activity)
            if result.count == 6 { break }
        }
        return result
    }
}
