import SwiftUI
import BalanceKit

/// The screen while something is being tracked. It answers two questions at a glance — what am I
/// doing, and how long has it been — and offers the only two things that can happen next: finish
/// it, or give a fixed session more time.
///
/// The clock is a `TimelineView` rather than a `Timer`: watchOS decides when this view is on screen
/// and how often it may redraw, so the schedule is handed to the system instead of being guessed at
/// by a timer that would keep firing into a suspended app.
struct ActiveSessionView: View {
    let session: ActiveSession
    let isBusy: Bool
    let onFinish: () -> Void
    let onExtend: (Int) -> Void

    /// What "+ more time" adds. Small enough to tap twice, large enough to be worth the tap.
    private static let extendStep = 15

    var body: some View {
        TimelineView(.periodic(from: session.startedAt, by: 1)) { context in
            ScrollView {
                VStack(spacing: 8) {
                    category
                    elapsed(now: context.date)
                    if let end = session.plannedEndAt {
                        remaining(until: end, now: context.date)
                    } else {
                        Text("Free session")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    actions
                }
                .padding(.horizontal, 2)
            }
        }
    }

    private var tint: Color { Color(hex: session.categoryColor) }

    private var category: some View {
        HStack(spacing: 5) {
            Image(systemName: Icons.symbol(for: session.categoryIcon))
                .font(.system(size: 13, weight: .semibold))
            Text(session.categoryName)
                .font(.footnote.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .foregroundStyle(tint)
    }

    private func elapsed(now: Date) -> some View {
        Text(clock(max(now.timeIntervalSince(session.startedAt), 0)))
            .font(.system(size: 38, weight: .medium, design: .monospaced))
            .minimumScaleFactor(0.5)
            .lineLimit(1)
            .contentTransition(.numericText())
    }

    /// A fixed session also shows how much of it is left, and a progress bar so the answer can be
    /// read without reading numbers. Once the planned end passes, the session keeps running and the
    /// line says so — the alarm has already fired, and overrunning is not an error.
    private func remaining(until end: Date, now: Date) -> some View {
        let left = end.timeIntervalSince(now)
        let planned = max(end.timeIntervalSince(session.startedAt), 1)
        let progress = min(max(now.timeIntervalSince(session.startedAt) / planned, 0), 1)

        return VStack(spacing: 4) {
            ProgressView(value: progress)
                .tint(tint)
            Text(left >= 0 ? "\(clock(left)) left" : "over by \(clock(-left))")
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(left >= 0 ? .secondary : Color.orange)
        }
    }

    private var actions: some View {
        VStack(spacing: 6) {
            Button(action: onFinish) {
                Label("Finish", systemImage: "stop.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(tint)
            .disabled(isBusy)

            if session.plannedEndAt != nil {
                Button {
                    onExtend(Self.extendStep)
                } label: {
                    Label("+\(Self.extendStep) min", systemImage: "plus")
                        .font(.footnote)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(isBusy)
            }
        }
        .overlay(alignment: .top) {
            if isBusy {
                ProgressView().controlSize(.mini).offset(y: -14)
            }
        }
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
