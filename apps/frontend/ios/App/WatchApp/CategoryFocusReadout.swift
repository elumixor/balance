import SwiftUI
import BalanceKit

/// The one line under the ring that says what the finger is currently pointing at: the category's
/// glyph and name, then how the week stands for it — "3.5 / 10h · 35%".
///
/// It keeps its height whether or not anything is focused, so the ring above it does not jump when
/// the drag crosses in and out of the dead zone; with nothing focused it shows the hint instead.
struct CategoryFocusReadout: View {
    let category: WatchCategory?

    /// What to say while the finger is still inside the dead zone.
    var placeholder = "Drag to pick"

    var body: some View {
        Group {
            if let category {
                HStack(spacing: 5) {
                    Image(systemName: Icons.symbol(for: category.icon))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color(hex: category.color))

                    Text(category.name)
                        .font(.footnote.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    Text(progress(for: category))
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .transition(.opacity)
            } else {
                Text(placeholder)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 20)
        .animation(.easeOut(duration: 0.15), value: category)
    }

    /// Hours read as a plain "spent / planned", and the percentage is of the plan — over a hundred
    /// is a real answer here, not something to clamp, because going over is the thing worth seeing.
    private func progress(for category: WatchCategory) -> String {
        let hours = "\(hoursText(category.actualHours)) / \(hoursText(category.targetHours))h"
        guard category.targetHours > 0 else { return hours }
        return "\(hours) · \(Int((category.ratio * 100).rounded()))%"
    }
}

#Preview {
    VStack(spacing: 12) {
        CategoryFocusReadout(
            category: WatchCategory(
                id: "1", name: "Deep work", color: "#7c5cff", icon: "brain",
                targetHours: 10, actualHours: 3.5
            )
        )
        CategoryFocusReadout(category: nil)
    }
}
