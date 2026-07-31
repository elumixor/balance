import SwiftUI
import BalanceKit

struct TrackView: View {
    @State private var viewModel = TrackViewModel()
    @State private var showingManualEntry = false
    @State private var editingEntry: Entry?
    @State private var showingFullActivityList = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if let running = viewModel.runningEntry {
                        RunningEntryCard(entry: running) {
                            Task { await viewModel.stop() }
                        }
                    } else {
                        quickStartSection
                    }

                    recentEntriesSection
                }
                .padding()
            }
            .navigationTitle("Track")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editingEntry = nil
                        showingManualEntry = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .refreshable { await viewModel.reload() }
            .overlay {
                if viewModel.isLoading && viewModel.trackData == nil {
                    ProgressView()
                }
            }
            .alert(
                "Something went wrong",
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.errorMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .sheet(isPresented: $showingManualEntry) {
                ManualEntrySheet(activities: viewModel.activities, editingEntry: nil) { id, input in
                    await viewModel.saveManualEntry(id: id, input: input)
                }
            }
            .sheet(item: $editingEntry) { entry in
                ManualEntrySheet(activities: viewModel.activities, editingEntry: entry) { id, input in
                    await viewModel.saveManualEntry(id: id, input: input)
                }
            }
            .sheet(isPresented: $showingFullActivityList) {
                ActivityPickerSheet(activities: viewModel.activities) { activity in
                    showingFullActivityList = false
                    Task { await viewModel.start(activityId: activity.id) }
                }
            }
            .task { await viewModel.reload() }
        }
    }

    @ViewBuilder
    private var quickStartSection: some View {
        let quickPicks = quickStartActivities

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Quick Start")
                    .font(.headline)
                Spacer()
                Button("All Activities") { showingFullActivityList = true }
                    .font(.subheadline)
            }

            if quickPicks.isEmpty {
                Text("No activities yet. Add one in the Config tab.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12)], spacing: 12) {
                    ForEach(quickPicks) { ref in
                        Button {
                            Task { await viewModel.start(activityId: ref.id) }
                        } label: {
                            Text(ref.name)
                                .font(.subheadline.bold())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
        }
    }

    private var quickStartActivities: [ActivityRef] {
        guard let trackData = viewModel.trackData else { return [] }
        var seen = Set<String>()
        var result: [ActivityRef] = []
        for ref in trackData.recentActivities + trackData.frequentActivities {
            if seen.insert(ref.id).inserted {
                result.append(ref)
            }
        }
        return Array(result.prefix(6))
    }

    @ViewBuilder
    private var recentEntriesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Entries")
                .font(.headline)

            if let entries = viewModel.trackData?.entries, !entries.isEmpty {
                VStack(spacing: 0) {
                    ForEach(entries) { entry in
                        EntryRow(entry: entry)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                guard !entry.isRunning else { return }
                                editingEntry = entry
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task { await viewModel.delete(entryId: entry.id) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        Divider()
                    }
                }
                .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 12))
            } else if !viewModel.isLoading {
                Text("No entries yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct EntryRow: View {
    let entry: Entry

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.activityName)
                    .font(.body.weight(.medium))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if entry.isRunning {
                Label("Running", systemImage: "record.circle.fill")
                    .font(.caption.bold())
                    .foregroundStyle(.red)
                    .labelStyle(.iconOnly)
            } else if let endedAt = entry.endedAt {
                Text(Formatting.elapsed(endedAt.timeIntervalSince(entry.startedAt)))
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    private var subtitle: String {
        if let note = entry.note, !note.isEmpty {
            return "\(Formatting.dateTime.string(from: entry.startedAt)) · \(note)"
        }
        return Formatting.dateTime.string(from: entry.startedAt)
    }
}

private struct ActivityPickerSheet: View {
    let activities: [Activity]
    let onSelect: (Activity) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(activities) { activity in
                Button {
                    onSelect(activity)
                } label: {
                    Text(activity.name)
                }
            }
            .navigationTitle("Start Timer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    TrackView()
}
