import Foundation
import BalanceKit

enum StatsPeriod: String, CaseIterable, Identifiable {
    case day, week, month
    var id: String { rawValue }
    var label: String {
        switch self {
        case .day: return "Day"
        case .week: return "Week"
        case .month: return "Month"
        }
    }
}

@Observable
@MainActor
final class StatsViewModel {
    var period: StatsPeriod = .week
    var categories: [CategoryStat] = []
    var isLoading = false
    var errorMessage: String?

    func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await APIClient.shared.fetchStats(period: period.rawValue)
            categories = response.categories
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
