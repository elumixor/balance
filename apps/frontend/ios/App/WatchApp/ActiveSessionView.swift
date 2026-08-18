import SwiftUI
import BalanceKit

/// The screen while something is being tracked. It is the same ring the duration was dialled on,
/// left in place rather than swapped for a different screen: the length becomes an elapsed clock,
/// the arc fills as the minutes pass, and the button underneath turns from starting the session to
/// finishing it.
///
/// The clock is a `TimelineView` rather than a `Timer`: watchOS decides when this view is on screen
/// and how often it may redraw, so the schedule is handed to the system instead of being guessed at
/// by a timer that would keep firing into a suspended app.
struct RunningSessionView: View {
    let session: ActiveSession
    let isBusy: Bool
    let onFinish: () -> Void
    let onExtend: (Int) -> Void

    /// How much bigger than the space it is offered the ring draws itself — matches the dial it
    /// continues from.
    private static let overscale: CGFloat = 1.2
    /// What "+ more time" adds. Small enough to tap twice, large enough to be worth the tap.
    private static let extendStep = 15

    private var tint: Color { Color(hex: session.categoryColor) }

    var body: some View {
        TimelineView(.periodic(from: session.startedAt, by: 1)) { context in
            let elapsed = max(context.date.timeIntervalSince(session.startedAt), 0)

            RingFace(color: tint, minutes: elapsed / 60, isFree: session.plannedEndAt == nil, tickTurns: [])
                .scaleEffect(Self.overscale)
                .overlay { readout(elapsed: elapsed, now: context.date) }
                .overlay(alignment: .bottom) { bottomControls }
        }
    }

    // MARK: - The middle

    private func readout(elapsed: TimeInterval, now: Date) -> some View {
        VStack(spacing: 2) {
            Text(clock(elapsed))
                .font(.system(size: 21, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: 92)

            // Once the planned end passes the session keeps running and the line says so — the
            // alarm has already fired, and overrunning is not an error.
            if let end = session.plannedEndAt {
                let left = end.timeIntervalSince(now)
                Text(left >= 0 ? "\(clock(left)) left" : "over \(clock(-left))")
                    .font(.system(size: 10))
                    .foregroundStyle(left >= 0 ? Color.secondary : Color.orange)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .padding(WheelMetrics.ringInset + WheelMetrics.dialThickness + 12)
    }

    // MARK: - Below the ring

    private var bottomControls: some View {
        VStack(spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: Icons.symbol(for: session.categoryIcon))
                    .font(.system(size: 11, weight: .semibold))
                Text(session.categoryName)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(tint)

            HStack(spacing: 6) {
                Button(action: onFinish) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.black)
                        .frame(width: 48, height: 25)
                        .background(tint, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isBusy)

                if session.plannedEndAt != nil {
                    Button {
                        onExtend(Self.extendStep)
                    } label: {
                        Text("+\(Self.extendStep)m")
                            .font(.system(size: 10, weight: .semibold))
                            .frame(width: 38, height: 25)
                    }
                    .buttonStyle(.bordered)
                    .disabled(isBusy)
                }
            }
            .overlay(alignment: .top) {
                if isBusy {
                    ProgressView().controlSize(.mini).offset(y: -12)
                }
            }
        }
        .padding(.bottom, 2)
    }

    /// h:mm:ss once an hour has passed, mm:ss before that — the leading zeros of a full clock are
    /// wasted width on a screen this size.
    private func clock(_ interval: TimeInterval) -> String {
        let total = Int(interval.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%02d:%02d", minutes, seconds)
    }
}
