import SwiftUI
import BalanceKit

/// How long a session should run. `free` has no planned end and no alarm — it is ended by hand.
enum TrackingDuration: Equatable {
    case fixed(minutes: Int)
    case free

    var minutes: Int? {
        switch self {
        case .fixed(let minutes): return minutes
        case .free: return nil
        }
    }
}

/// The step between letting go of the dial and anything being written. The gesture picks a
/// category, this picks how long — nothing reaches the calendar until Start is tapped, so a drag
/// that landed on the wrong segment costs a cancel rather than an event someone has to delete.
struct StartTrackingSheet: View {
    let category: WatchCategory
    let onStart: (TrackingDuration) -> Void
    let onCancel: () -> Void

    private static let presets = [15, 25, 30, 45, 60, 90]

    /// The crown-driven value, kept separate from the presets so scrolling it doesn't disturb the
    /// quick choices. It starts at half an hour because that is what most sessions turn out to be.
    @State private var customMinutes: Double = 30
    @FocusState private var customFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                header

                Text("Duration")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                presetGrid
                customRow

                Button {
                    onStart(.free)
                } label: {
                    Label("Free — end it myself", systemImage: "infinity")
                        .font(.footnote)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.bordered)

                Button("Cancel", role: .cancel, action: onCancel)
                    .font(.footnote)
            }
            .padding(.horizontal, 2)
        }
        // The crown belongs to the custom value here rather than to scrolling: the sheet is short,
        // and dialling a duration is the only thing on it that the crown can do.
        .onAppear { customFocused = true }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: Icons.symbol(for: category.icon))
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color(hex: category.color))
            VStack(alignment: .leading, spacing: 1) {
                Text(category.name)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(weekStanding)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var weekStanding: String {
        let percent = Int((category.ratio * 100).rounded())
        return "\(hoursText(category.actualHours)) / \(hoursText(category.targetHours))h · \(percent)%"
    }

    private var presetGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
            ForEach(Self.presets, id: \.self) { minutes in
                Button {
                    onStart(.fixed(minutes: minutes))
                } label: {
                    Text("\(minutes)")
                        .font(.system(.body, design: .rounded).weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 34)
                }
                .buttonStyle(.bordered)
                .tint(Color(hex: category.color))
            }
        }
    }

    /// Anything the presets don't cover, dialled in with the crown in five-minute steps so it can
    /// be set without looking closely at a small screen.
    private var customRow: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Custom")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(durationLabel(Int(customMinutes)))
                    .font(.system(.title3, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color(hex: category.color).opacity(customFocused ? 0.28 : 0.14))
            )
            .focusable()
            .focused($customFocused)
            .digitalCrownRotation(
                $customMinutes,
                from: 5,
                through: 240,
                by: 5,
                sensitivity: .medium,
                isContinuous: false,
                isHapticFeedbackEnabled: true
            )

            Button {
                onStart(.fixed(minutes: Int(customMinutes)))
            } label: {
                Image(systemName: "play.fill")
                    .frame(minWidth: 34, minHeight: 34)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(hex: category.color))
        }
    }

    private func durationLabel(_ minutes: Int) -> String {
        guard minutes >= 60 else { return "\(minutes) min" }
        let hours = minutes / 60
        let rest = minutes % 60
        return rest == 0 ? "\(hours) h" : "\(hours) h \(rest)"
    }
}
