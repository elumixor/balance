import SwiftUI
import Charts
import BalanceKit

struct StatsView: View {
    @State private var viewModel = StatsViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Picker("Period", selection: $viewModel.period) {
                        ForEach(StatsPeriod.allCases) { period in
                            Text(period.label).tag(period)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: viewModel.period) {
                        Task { await viewModel.reload() }
                    }

                    if !viewModel.categories.isEmpty {
                        chart
                    }

                    VStack(spacing: 12) {
                        ForEach(viewModel.categories) { stat in
                            CategoryStatRow(stat: stat)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Stats")
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
            .refreshable { await viewModel.reload() }
            .task { await viewModel.reload() }
        }
    }

    private var chart: some View {
        Chart(viewModel.categories) { stat in
            BarMark(
                x: .value("Hours", stat.actualHours),
                y: .value("Category", stat.name)
            )
            .foregroundStyle(Color(hex: stat.color))
            .annotation(position: .trailing) {
                Text(Formatting.hoursAndMinutes(stat.actualHours))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(height: CGFloat(viewModel.categories.count) * 44 + 20)
    }
}

private struct CategoryStatRow: View {
    let stat: CategoryStat

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Circle()
                    .fill(Color(hex: stat.color))
                    .frame(width: 10, height: 10)
                Text(stat.name)
                    .font(.subheadline.bold())

                Spacer()

                diffIndicator
            }

            ProgressView(value: min(stat.actualHours, stat.targetHours > 0 ? stat.targetHours : stat.actualHours), total: stat.targetHours > 0 ? stat.targetHours : max(stat.actualHours, 1))
                .tint(Color(hex: stat.color))

            HStack {
                Text("\(Formatting.hoursAndMinutes(stat.actualHours)) / \(Formatting.hoursAndMinutes(stat.targetHours)) target")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()
            }
        }
        .padding()
        .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 12))
    }

    private var diffIndicator: some View {
        let isOver = stat.diffHours >= 0
        return Label(
            "\(isOver ? "+" : "")\(Formatting.hoursAndMinutes(stat.diffHours))",
            systemImage: isOver ? "arrow.up" : "arrow.down"
        )
        .font(.caption.bold())
        .foregroundStyle(isOver ? .green : .orange)
    }
}

#Preview {
    StatsView()
}
