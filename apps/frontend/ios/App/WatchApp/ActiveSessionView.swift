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
    /// The clock the screen is being drawn at. It comes from the one `TimelineView` around the whole
    /// ring, because the ring's own arc is the session's elapsed time — the arc and the numbers have
    /// to be told what time it is by the same tick, or they can disagree about the second.
    let now: Date

    private var tint: Color { Color(hex: session.categoryColor) }

    var body: some View {
        let elapsed = max(now.timeIntervalSince(session.startedAt), 0)

        RingFace(
            color: tint,
            minutes: elapsed / 60,
            isFree: session.plannedEndAt == nil,
            tickTurns: []
        )
        .overlay {
            DialReadout(
                tint: tint,
                categoryName: session.categoryName,
                categoryIcon: session.categoryIcon,
                value: RunningSessionView.clock(elapsed),
                note: note,
                noteColor: isOverrun ? .orange : .secondary
            )
        }
    }

    /// Once the planned end passes the session keeps running and the line says so — the alarm has
    /// already fired, and overrunning is not an error.
    private var note: String? {
        guard let end = session.plannedEndAt else { return nil }
        let left = end.timeIntervalSince(now)
        return left >= 0 ? "\(Self.clock(left)) left" : "over \(Self.clock(-left))"
    }

    private var isOverrun: Bool {
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
/// start button did — the ring keeps its whole height, and the control floats over its lower arc
/// with enough shadow under it that the arc reads as passing behind.
///
/// Stopping is the only thing offered. A session that runs past its planned end keeps running and
/// says so, so there is nothing "+15 more minutes" would buy that letting it overrun doesn't.
struct RunningControls: View {
    let session: ActiveSession
    let isBusy: Bool
    /// Whether this timer is the watch's own — started with no signal, so nothing else knows about
    /// it yet. Worth a mark, because "it is not on my phone" is otherwise a small mystery; not
    /// worth a sentence, because the timer is running perfectly well.
    var isLocal = false
    let onFinish: () -> Void

    private var tint: Color { Color(hex: session.categoryColor) }

    var body: some View {
        Button(action: onFinish) {
            Image(systemName: "stop.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.black)
                .frame(width: 54, height: 28)
                .background(tint, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .ringButtonShadow()
        .overlay(alignment: .top) {
            if isBusy {
                ProgressView().controlSize(.mini).offset(y: -12)
            } else if isLocal {
                Image(systemName: "cloud.slash")
                    .font(.system(size: 8))
                    .foregroundStyle(.secondary)
                    .offset(y: -12)
            }
        }
    }
}
