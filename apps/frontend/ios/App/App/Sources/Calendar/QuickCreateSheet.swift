import BalanceCore
import SwiftUI

/// A new block where the grid was tapped: type its name, and anything else the line can say.
///
/// The hour that was tapped is the block's unless the line names another — a time moves it within
/// the day, a day moves it to that day, a length stretches it — so "Deep work 2h #work" typed into
/// a 14:00 slot is two hours of deep work from two.
struct QuickCreateSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let start: Date
    let end: Date

    @State private var text = ""
    @State private var focused = true

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(Format.day(start) + ", " + Format.range(slot.start, slot.end))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .contentTransition(.numericText())
                    .animation(.snappy, value: slot.start)
                Spacer()
                Button("Add") { submit() }
                    .buttonStyle(.borderedProminent)
                    .disabled(line.title.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityIdentifier("quickAdd")
            }
            LineEditor(
                text: $text, focused: $focused, placeholder: "Name it — “Deep work 2h #work”", showPreview: false,
                onSubmit: { _ in submit() }, onCancel: { dismiss() }
            )
            .padding(.horizontal, 12)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            Spacer(minLength: 0)
        }
        .padding(16)
    }

    private var line: TypedLine { LineReader.read(text, vocabulary: store.vocabulary, now: start) }

    /// The tapped hour, moved by whatever the line said about time.
    private var slot: (start: Date, end: Date, allDay: Bool) {
        let line = line
        let saidDay = line.tokens.contains { $0.kind == .date }
        let calendar = store.calendar
        switch line.intent {
        case .event(let s, let e, let allDay) where saidDay || line.time != nil:
            if allDay { return (s, e, true) }
            if saidDay { return (s, e, false) }
            // A time without a day is that time on the tapped day.
            let base = calendar.startOfDay(for: start)
            let shiftedStart = calendar.date(byAdding: .day, value: calendar.dateComponents([.day], from: calendar.startOfDay(for: s), to: base).day ?? 0, to: s)!
            return (shiftedStart, shiftedStart.addingTimeInterval(e.timeIntervalSince(s)), false)
        default:
            let minutes = line.durationMinutes.map(Double.init) ?? end.timeIntervalSince(start) / 60
            return (start, start.addingTimeInterval(minutes * 60), false)
        }
    }

    private func submit() {
        let line = line
        let title = line.title.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        let slot = slot
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        dismiss()
        Task {
            await store.createEvent(.init(
                title: title, start: slot.start, end: slot.end, allDay: slot.allDay, sphereId: line.sphereId,
                activityId: line.activityId, projectId: line.projectId, recurrence: line.recurrence
            ))
        }
    }
}
