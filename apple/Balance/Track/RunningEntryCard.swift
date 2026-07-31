import SwiftUI
import BalanceKit

struct RunningEntryCard: View {
    let entry: Entry
    let onStop: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Label("Tracking", systemImage: "record.circle.fill")
                .font(.subheadline.bold())
                .foregroundStyle(.red)

            Text(entry.activityName)
                .font(.title2.bold())

            TimelineView(.periodic(from: entry.startedAt, by: 1)) { context in
                Text(Formatting.elapsed(context.date.timeIntervalSince(entry.startedAt)))
                    .font(.system(size: 44, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
            }

            if let note = entry.note, !note.isEmpty {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Button(role: .destructive, action: onStop) {
                Label("Stop", systemImage: "stop.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .controlSize(.large)
        }
        .padding(20)
        .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 16))
    }
}
