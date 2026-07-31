import SwiftUI
import BalanceKit

struct ActivityEditSheet: View {
    let categories: [BalanceKit.Category]
    let editingActivity: Activity?
    let onSave: (String?, APIClient.ActivityInput) async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var weights: [String: Int]
    @State private var isSaving = false

    init(categories: [BalanceKit.Category], editingActivity: Activity?, onSave: @escaping (String?, APIClient.ActivityInput) async -> Void) {
        self.categories = categories
        self.editingActivity = editingActivity
        self.onSave = onSave
        _name = State(initialValue: editingActivity?.name ?? "")
        var initialWeights: [String: Int] = [:]
        for weight in editingActivity?.weights ?? [] {
            initialWeights[weight.categoryId] = weight.weightPercent
        }
        _weights = State(initialValue: initialWeights)
    }

    private var assignableCategories: [BalanceKit.Category] {
        categories.filter { !$0.isBuffer }
    }

    private var totalWeight: Int {
        weights.values.reduce(0, +)
    }

    private var freeTimePercent: Int {
        max(0, 100 - totalWeight)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Activity name", text: $name)
                }

                Section {
                    ForEach(assignableCategories) { category in
                        HStack {
                            Circle()
                                .fill(Color(hex: category.color))
                                .frame(width: 10, height: 10)
                            Text(category.name)
                            Spacer()
                            Stepper(
                                "\(weights[category.id] ?? 0)%",
                                value: Binding(
                                    get: { weights[category.id] ?? 0 },
                                    set: { weights[category.id] = $0 }
                                ),
                                in: 0...100,
                                step: 5
                            )
                            .fixedSize()
                        }
                    }
                } header: {
                    Text("Category Weights")
                } footer: {
                    Text("Weights don't need to sum to 100%. \(freeTimePercent)% remainder counts as free time toward Rest + Buffer.")
                }
            }
            .navigationTitle(editingActivity == nil ? "New Activity" : "Edit Activity")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            isSaving = true
                            let activityWeights = weights
                                .filter { $0.value > 0 }
                                .map { ActivityWeight(categoryId: $0.key, weightPercent: $0.value) }
                            let input = APIClient.ActivityInput(name: name, weights: activityWeights)
                            await onSave(editingActivity?.id, input)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
        }
    }
}
