import Foundation
import BalanceKit

@Observable
@MainActor
final class ConfigViewModel {
    var categories: [BalanceKit.Category] = []
    var activities: [Activity] = []
    var isLoading = false
    var errorMessage: String?

    /// Sum of target hours across non-buffer categories, out of a 168h week.
    var allocatedHours: Double {
        categories.filter { !$0.isBuffer }.reduce(0) { $0 + $1.targetHoursPerWeek }
    }

    func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let cats = APIClient.shared.fetchCategories()
            async let acts = APIClient.shared.fetchActivities()
            categories = try await cats.filter { !$0.archived }
            activities = try await acts.filter { !$0.archived }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveCategory(id: String?, input: APIClient.CategoryInput) async {
        do {
            if let id {
                try await APIClient.shared.updateCategory(id: id, input)
            } else {
                try await APIClient.shared.createCategory(input)
            }
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func archiveCategory(id: String) async {
        do {
            try await APIClient.shared.archiveCategory(id: id)
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveActivity(id: String?, input: APIClient.ActivityInput) async {
        do {
            if let id {
                try await APIClient.shared.updateActivity(id: id, input)
            } else {
                try await APIClient.shared.createActivity(input)
            }
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func archiveActivity(id: String) async {
        do {
            try await APIClient.shared.archiveActivity(id: id)
            await reload()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
