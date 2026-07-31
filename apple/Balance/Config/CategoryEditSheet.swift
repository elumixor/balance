import SwiftUI
import BalanceKit

struct CategoryEditSheet: View {
    let editingCategory: BalanceKit.Category?
    let onSave: (String?, APIClient.CategoryInput) async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var color: Color
    @State private var targetHours: Double
    @State private var isSaving = false

    init(editingCategory: BalanceKit.Category?, onSave: @escaping (String?, APIClient.CategoryInput) async -> Void) {
        self.editingCategory = editingCategory
        self.onSave = onSave
        _name = State(initialValue: editingCategory?.name ?? "")
        _color = State(initialValue: Color(hex: editingCategory?.color ?? "#4A90D9"))
        _targetHours = State(initialValue: editingCategory?.targetHoursPerWeek ?? 5)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Category name", text: $name)
                }

                Section("Color") {
                    ColorPicker("Color", selection: $color, supportsOpacity: false)
                }

                Section("Weekly Target") {
                    Stepper(value: $targetHours, in: 0...168, step: 0.5) {
                        Text("\(Formatting.hoursAndMinutes(targetHours)) / week")
                    }
                }
            }
            .navigationTitle(editingCategory == nil ? "New Category" : "Edit Category")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            isSaving = true
                            let input = APIClient.CategoryInput(
                                name: name,
                                color: color.hexString,
                                targetHoursPerWeek: targetHours
                            )
                            await onSave(editingCategory?.id, input)
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
