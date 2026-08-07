import Foundation
import BalanceKit
import WidgetKit

@MainActor
@Observable
final class UsageViewModel {
    private(set) var categories: [CategoryStat] = []
    private(set) var isLoading = false
    private(set) var needsCalendar = false
    var errorMessage: String?

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let stats = try await APIClient.shared.fetchStats(period: "week")
            categories = stats.categories
            needsCalendar = !stats.connected
            errorMessage = nil
            publishToWidget()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// The widget reads a small App Group blob rather than making its own call, so every refresh
    /// here is also the widget's refresh.
    private func publishToWidget() {
        let worst = categories
            .filter { $0.targetHours > 0 }
            .max { abs($0.diffHours) < abs($1.diffHours) }

        WatchSharedState.save(
            worst.map {
                WeekSnapshot(
                    categoryName: $0.name,
                    categoryColor: $0.color,
                    actualHours: $0.actualHours,
                    targetHours: $0.targetHours,
                    updatedAt: Date()
                )
            }
        )
        WidgetCenter.shared.reloadAllTimelines()
    }
}
