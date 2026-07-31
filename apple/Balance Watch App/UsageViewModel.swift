import Foundation
import BalanceKit

@MainActor
@Observable
final class UsageViewModel {
    private(set) var categories: [CategoryStat] = []
    private(set) var isLoading = false
    var errorMessage: String?

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let stats = try await APIClient.shared.fetchStats(period: "week")
            categories = stats.categories
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
