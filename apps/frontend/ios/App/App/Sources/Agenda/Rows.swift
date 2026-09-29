import SwiftUI

/// An event in the list: its time, a bar in its sphere's colour, its name and what goes with it.
struct EventRow: View {
    @Environment(Store.self) private var store
    let event: CalendarEvent
    let now: Date
    var showDay = false

    private var sphere: Sphere? { store.sphere(of: event) }
    private var past: Bool { event.end <= now }
    private var live: Bool { event.start <= now && now < event.end && !event.allDay }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .trailing, spacing: 1) {
                if showDay {
                    Text(event.start.formatted(.dateTime.weekday(.abbreviated)))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                if event.allDay {
                    Text("all day").font(.caption).foregroundStyle(.secondary)
                } else {
                    Text(Format.time(event.start)).font(.subheadline.monospacedDigit())
                    Text(Format.time(event.end)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
            }
            .frame(width: 52, alignment: .trailing)

            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(sphere?.tint ?? Color(.systemGray3))
                .frame(width: 4)
                .opacity(event.tentative || event.response == "needsAction" ? 0.45 : 1)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(event.title.isEmpty ? "Untitled" : event.title)
                        .font(.body)
                        .foregroundStyle(past ? .secondary : .primary)
                        .lineLimit(2)
                    if live {
                        Text("now")
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(sphere?.tint.opacity(0.2) ?? Color(.systemFill), in: Capsule())
                    }
                }
                chips
                if live {
                    ProgressView(value: now.timeIntervalSince(event.start), total: event.end.timeIntervalSince(event.start))
                        .tint(sphere?.tint ?? .primary)
                        .scaleEffect(y: 0.6, anchor: .center)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("event-\(event.title)")
    }

    @ViewBuilder private var chips: some View {
        let items = chipItems
        if !items.isEmpty {
            HStack(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    HStack(spacing: 3) {
                        Image(systemName: item.symbol)
                            .imageScale(.small)
                            .foregroundStyle(item.tinted ? AnyShapeStyle(sphere?.tint ?? .secondary) : AnyShapeStyle(.secondary))
                        if !item.text.isEmpty { Text(item.text) }
                    }
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
    }

    private struct Chip: Hashable {
        let symbol: String
        let text: String
        var tinted = false
    }

    private var chipItems: [Chip] {
        var chips: [Chip] = []
        if !event.allDay { chips.append(Chip(symbol: "clock", text: Format.duration(minutes: event.durationMinutes))) }
        if let sphere { chips.append(Chip(symbol: "circle.fill", text: event.activityName ?? sphere.name, tinted: true)) }
        if let project = event.projectId.flatMap({ store.projects[$0] }) { chips.append(Chip(symbol: "folder", text: project.name)) }
        if let location = event.location, !location.isEmpty {
            chips.append(Chip(symbol: "mappin", text: location.components(separatedBy: ",").first ?? location))
        }
        if event.conferenceUrl != nil { chips.append(Chip(symbol: "video", text: event.conferenceName ?? "Call")) }
        if event.isRepeating { chips.append(Chip(symbol: "repeat", text: "")) }
        if event.response == "needsAction" { chips.append(Chip(symbol: "envelope", text: "Invited")) }
        return chips
    }
}

/// A to-do: a circle to tick it off, its name, and its project.
struct TaskRow: View {
    @Environment(Store.self) private var store
    let task: TaskItem
    var showDay = false
    let toggle: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: toggle) {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(task.isDone ? AnyShapeStyle(tint) : AnyShapeStyle(.tertiary))
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 52, alignment: .trailing)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("check-\(task.title)")
            .accessibilityLabel(task.isDone ? "Mark not done" : "Mark done")
            .sensoryFeedback(.success, trigger: task.isDone) { _, done in done }

            Color.clear.frame(width: 4)

            VStack(alignment: .leading, spacing: 4) {
                Text(task.title.isEmpty ? "Untitled" : task.title)
                    .strikethrough(task.isDone, color: .secondary)
                    .foregroundStyle(task.isDone ? .secondary : .primary)
                    .lineLimit(3)
                HStack(spacing: 8) {
                    if let project = store.projects[task.projectId] {
                        HStack(spacing: 3) {
                            Image(systemName: "folder").imageScale(.small)
                            Text(project.name)
                        }
                        .foregroundStyle(tint)
                    }
                    if let day = task.day, showDay || overdue(day) {
                        HStack(spacing: 3) {
                            Image(systemName: "calendar").imageScale(.small)
                            Text(Format.day(day))
                        }
                        .foregroundStyle(overdue(day) && !task.isDone ? AnyShapeStyle(.red) : AnyShapeStyle(.secondary))
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("task-\(task.title)")
    }

    private func overdue(_ day: Date) -> Bool { day < Calendar.current.startOfDay(for: .now) }

    private var tint: Color {
        store.projects[task.projectId].flatMap { store.spheres[$0.categoryId]?.tint } ?? .primary
    }
}
