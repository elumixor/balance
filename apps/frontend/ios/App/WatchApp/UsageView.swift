import SwiftUI
import BalanceKit

/// Second page (reached by a horizontal swipe from ``TrackingView``): compact this-week
/// actual-vs-target per category.
struct UsageView: View {
    @State private var viewModel = UsageViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.categories.isEmpty {
                ProgressView()
            } else if viewModel.categories.isEmpty {
                Text("No data yet")
                    .foregroundStyle(.secondary)
            } else {
                List(viewModel.categories) { category in
                    CategoryUsageRow(category: category)
                }
                .listStyle(.carousel)
            }
        }
        .task { await viewModel.refresh() }
        .refreshable { await viewModel.refresh() }
    }
}

private struct CategoryUsageRow: View {
    let category: CategoryStat

    private var fraction: Double {
        guard category.targetHours > 0 else { return 0 }
        return min(category.actualHours / category.targetHours, 1.0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(category.name)
                .font(.subheadline)
                .lineLimit(1)
            ProgressView(value: fraction)
                .tint(colorFromHex(category.color))
            Text("\(formatted(category.actualHours))h / \(formatted(category.targetHours))h")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private func formatted(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", value)
            : String(format: "%.1f", value)
    }
}

private func colorFromHex(_ hex: String) -> Color {
    let sanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard sanitized.count == 6, let value = UInt64(sanitized, radix: 16) else { return .accentColor }
    let r = Double((value >> 16) & 0xFF) / 255
    let g = Double((value >> 8) & 0xFF) / 255
    let b = Double(value & 0xFF) / 255
    return Color(red: r, green: g, blue: b)
}
