import Foundation
import BalanceKit

@Observable
@MainActor
final class TrackViewModel {
    var runningEntry: Entry?
    var trackData: TrackData?
    var activities: [Activity] = []

    var isLoading = false
    var errorMessage: String?

    func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let running = APIClient.shared.fetchRunningEntry()
            async let track = APIClient.shared.fetchTrackData()
            async let acts = APIClient.shared.fetchActivities()
            runningEntry = try await running
            trackData = try await track
            activities = try await acts.filter { !$0.archived }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func start(activityId: String) async {
        do {
            try await APIClient.shared.startTimer(activityId: activityId)
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stop() async {
        do {
            try await APIClient.shared.stopTimer()
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(entryId: String) async {
        do {
            try await APIClient.shared.deleteEntry(id: entryId)
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveManualEntry(id: String?, input: APIClient.ManualEntryInput) async {
        do {
            if let id {
                try await APIClient.shared.updateEntry(id: id, input)
            } else {
                try await APIClient.shared.createEntry(input)
            }
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
