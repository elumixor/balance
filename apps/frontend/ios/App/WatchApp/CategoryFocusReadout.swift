import SwiftUI
import BalanceKit

/// The card over the ring that says what the finger is currently pointing at: the category's glyph
/// and name on top, and how the week stands for it underneath — "3.5 / 10h · 35%".
///
/// Two lines rather than one because it rides the finger: a single line long enough to hold both
/// halves is wider than the screen has to spare once the drag reaches for the rim, and the half that
/// gets squeezed out is always the numbers.
///
/// It draws nothing at all while the drag is inside the dead zone. There is no hint to replace it
/// with: the ring appearing under the thumb is the instruction.
struct CategoryFocusReadout: View {
    let category: WatchCategory?

    var body: some View {
        Group {
            if let category {
                VStack(spacing: 0) {
                    HStack(spacing: 4) {
                        Image(systemName: Icons.symbol(for: category.icon))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color(hex: category.color))

                        Text(category.name)
                            .font(.footnote.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }

                    Text(progress(for: category))
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(.black.opacity(0.8), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .frame(maxWidth: 130)
                .transition(.opacity)
            }
        }
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
