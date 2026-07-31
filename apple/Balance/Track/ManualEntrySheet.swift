import SwiftUI
import BalanceKit

/// Create or edit a manual (non-timer) entry.
struct ManualEntrySheet: View {
    let activities: [Activity]
    /// Non-nil when editing an existing entry.
    let editingEntry: Entry?
    let onSave: (String?, APIClient.ManualEntryInput) async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var selectedActivityId: String
    @State private var startedAt: Date
    @State private var endedAt: Date
    @State private var note: String
    @State private var isSaving = false

    init(activities: [Activity], editingEntry: Entry?, onSave: @escaping (String?, APIClient.ManualEntryInput) async -> Void) {
        self.activities = activities
        self.editingEntry = editingEntry
        self.onSave = onSave
        _selectedActivityId = State(initialValue: editingEntry?.activityId ?? activities.first?.id ?? "")
        _startedAt = State(initialValue: editingEntry?.startedAt ?? Date().addingTimeInterval(-3600))
        _endedAt = State(initialValue: editingEntry?.endedAt ?? Date())
        _note = State(initialValue: editingEntry?.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Activity") {
                    Picker("Activity", selection: $selectedActivityId) {
                        ForEach(activities) { activity in
                            Text(activity.name).tag(activity.id)
                        }
                    }
                }

                Section("Time") {
                    DatePicker("Start", selection: $startedAt)
                    DatePicker("End", selection: $endedAt)
                }

                Section("Note") {
                    TextField("Optional note", text: $note, axis: .vertical)
                }
            }
            .navigationTitle(editingEntry == nil ? "New Entry" : "Edit Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            isSaving = true
                            let input = APIClient.ManualEntryInput(
                                activityId: selectedActivityId,
                                startedAt: startedAt,
                                endedAt: endedAt,
                                note: note.isEmpty ? nil : note
                            )
                            await onSave(editingEntry?.id, input)
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(selectedActivityId.isEmpty || endedAt < startedAt || isSaving)
                }
            }
        }
    }
}
