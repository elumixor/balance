import SwiftUI
import ClerkKit
import BalanceKit

struct ConfigView: View {
    @State private var viewModel = ConfigViewModel()
    @State private var showingNewCategory = false
    @State private var editingCategory: BalanceKit.Category?
    @State private var showingNewActivity = false
    @State private var editingActivity: Activity?

    @Environment(Clerk.self) private var clerk

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text("Allocated")
                        Spacer()
                        Text("\(Formatting.hoursAndMinutes(viewModel.allocatedHours)) / 168h")
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Categories")
                } footer: {
                    Text("Rest + Buffer automatically absorbs whatever's left of the week.")
                }

                ForEach(viewModel.categories) { category in
                    Button {
                        guard !category.isBuffer else { return }
                        editingCategory = category
                    } label: {
                        CategoryRow(category: category)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing) {
                        if !category.isBuffer {
                            Button(role: .destructive) {
                                Task { await viewModel.archiveCategory(id: category.id) }
                            } label: {
                                Label("Archive", systemImage: "archivebox")
                            }
                        }
                    }
                }

                Button {
                    showingNewCategory = true
                } label: {
                    Label("Add Category", systemImage: "plus")
                }

                Section("Activities") {
                    ForEach(viewModel.activities) { activity in
                        Button {
                            editingActivity = activity
                        } label: {
                            ActivityRow(activity: activity, categories: viewModel.categories)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { await viewModel.archiveActivity(id: activity.id) }
                            } label: {
                                Label("Archive", systemImage: "archivebox")
                            }
                        }
                    }

                    Button {
                        showingNewActivity = true
                    } label: {
                        Label("Add Activity", systemImage: "plus")
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        Task { try? await clerk.auth.signOut() }
                    }
                }
            }
            .navigationTitle("Config")
            .refreshable { await viewModel.reload() }
            .overlay {
                if viewModel.isLoading && viewModel.categories.isEmpty {
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
            .sheet(isPresented: $showingNewCategory) {
                CategoryEditSheet(editingCategory: nil) { id, input in
                    await viewModel.saveCategory(id: id, input: input)
                }
            }
            .sheet(item: $editingCategory) { category in
                CategoryEditSheet(editingCategory: category) { id, input in
                    await viewModel.saveCategory(id: id, input: input)
                }
            }
            .sheet(isPresented: $showingNewActivity) {
                ActivityEditSheet(categories: viewModel.categories, editingActivity: nil) { id, input in
                    await viewModel.saveActivity(id: id, input: input)
                }
            }
            .sheet(item: $editingActivity) { activity in
                ActivityEditSheet(categories: viewModel.categories, editingActivity: activity) { id, input in
                    await viewModel.saveActivity(id: id, input: input)
                }
            }
            .task { await viewModel.reload() }
        }
    }
}

private struct CategoryRow: View {
    let category: BalanceKit.Category

    var body: some View {
        HStack {
            Circle()
                .fill(Color(hex: category.color))
                .frame(width: 10, height: 10)
            Text(category.name)
                .foregroundStyle(.primary)

            if category.isBuffer {
                Text("Buffer")
                    .font(.caption2.bold())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.fill.secondary, in: Capsule())
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if !category.isBuffer {
                Text("\(Formatting.hoursAndMinutes(category.targetHoursPerWeek))/wk")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct ActivityRow: View {
    let activity: Activity
    let categories: [BalanceKit.Category]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(activity.name)
                .foregroundStyle(.primary)
            if !activity.weights.isEmpty {
                Text(weightSummary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var weightSummary: String {
        activity.weights
            .map { weight -> String in
                let name = categories.first(where: { $0.id == weight.categoryId })?.name ?? "?"
                return "\(name) \(weight.weightPercent)%"
            }
            .joined(separator: ", ")
    }
}

#Preview {
    ConfigView()
        .environment(Clerk.shared)
}
