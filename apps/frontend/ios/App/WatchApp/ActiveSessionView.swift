import SwiftUI
import BalanceKit

/// The ring while something is being tracked. It is the same ring the duration was dialled on, left
/// exactly where it was rather than swapped for a different screen: the length becomes an elapsed
/// clock, the arc fills as the minutes pass, and the category's glyph stays put underneath it.
///
/// The clock is a `TimelineView` rather than a `Timer`: watchOS decides when this view is on screen
/// and how often it may redraw, so the schedule is handed to the system instead of being guessed at
/// by a timer that would keep firing into a suspended app.
struct RunningSessionView: View {
    let session: ActiveSession
    let glyphs: Namespace.ID

    private var tint: Color { Color(hex: session.categoryColor) }

    var body: some View {
        TimelineView(.periodic(from: session.startedAt, by: 1)) { context in
            let elapsed = max(context.date.timeIntervalSince(session.startedAt), 0)

            RingFace(
                color: tint,
                minutes: elapsed / 60,
                isFree: session.plannedEndAt == nil,
                tickTurns: []
            )
            .overlay {
                DialReadout(
                    tint: tint,
                    categoryID: session.categoryId,
                    categoryName: session.categoryName,
                    categoryIcon: session.categoryIcon,
                    value: RunningSessionView.clock(elapsed),
                    note: note(now: context.date),
                    noteColor: isOverrun(now: context.date) ? .orange : .secondary,
                    glyphs: glyphs
                )
            }
        }
    }

    /// Once the planned end passes the session keeps running and the line says so — the alarm has
    /// already fired, and overrunning is not an error.
    private func note(now: Date) -> String? {
        guard let end = session.plannedEndAt else { return nil }
        let left = end.timeIntervalSince(now)
        return left >= 0 ? "\(Self.clock(left)) left" : "over \(Self.clock(-left))"
    }

    private func isOverrun(now: Date) -> Bool {
        guard let end = session.plannedEndAt else { return false }
        return end.timeIntervalSince(now) < 0
    }

    /// h:mm:ss once an hour has passed, mm:ss before that — the leading zeros of a full clock are
    /// wasted width on a screen this size.
    static func clock(_ interval: TimeInterval) -> String {
        let total = Int(interval.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%02d:%02d", minutes, seconds)
    }
}

/// What a running session can be done to, sitting in the screen's bottom margin the same way the
/// start button did — the ring keeps its whole height, and the controls float over its lower arc
/// with enough shadow under them that the arc reads as passing behind.
struct RunningControls: View {
    let session: ActiveSession
    let isBusy: Bool
    let onFinish: () -> Void
    let onExtend: (Int) -> Void

    /// What "+ more time" adds. Small enough to tap twice, large enough to be worth the tap.
    private static let extendStep = 15

    private var tint: Color { Color(hex: session.categoryColor) }

    var body: some View {
        HStack(spacing: 6) {
            Button(action: onFinish) {
                Image(systemName: "stop.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.black)
                    .frame(width: 54, height: 28)
                    .background(tint, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isBusy)

            if session.plannedEndAt != nil {
                Button {
                    onExtend(Self.extendStep)
                } label: {
                    Text("+\(Self.extendStep)m")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 42, height: 28)
                        .background(.white.opacity(0.18), in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
            }
        }
        .ringButtonShadow()
        .overlay(alignment: .top) {
            if isBusy {
                ProgressView().controlSize(.mini).offset(y: -12)
            }
        }
    }
}
