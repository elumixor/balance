import BalanceCore
import SwiftUI

/// One page of the pager: a few days' columns over the hour lines.
struct DaysPage: View {
    @Environment(Store.self) private var store
    let start: Date
    let days: Int
    let hourHeight: CGFloat
    let onCreate: (Date) -> Void

    var body: some View {
        let calendar = store.calendar
        let dates = (0..<days).map { calendar.date(byAdding: .day, value: $0, to: start)! }
        ZStack(alignment: .topLeading) {
            HourLines(hourHeight: hourHeight)
            HStack(spacing: 0) {
                ForEach(dates, id: \.self) { date in
                    DayColumn(day: date, hourHeight: hourHeight, compact: days == 7, onCreate: onCreate)
                        .overlay(alignment: .leading) {
                            Rectangle().fill(Color(.separator)).frame(width: 0.5)
                        }
                }
            }
        }
        .frame(height: hourHeight * 24, alignment: .top)
    }
}

private struct HourLines: View {
    let hourHeight: CGFloat

    var body: some View {
        Canvas { context, size in
            for hour in 0...24 {
                let y = CGFloat(hour) * hourHeight
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(path, with: .color(Color(.separator)), lineWidth: 0.5)
            }
        }
        .allowsHitTesting(false)
    }
}

/// A day's blocks, laid out lane by lane, and every gesture a block or an empty hour takes.
struct DayColumn: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    let day: Date
    let hourHeight: CGFloat
    var compact = false
    let onCreate: (Date) -> Void

    /// A block being carried or stretched: what it was, and how far the finger has taken it.
    @State private var drag: DragState?

    struct DragState: Equatable {
        enum Kind { case move, resize }
        let key: String
        let kind: Kind
        var minutes: Double
        var days: Int
    }

    private var calendar: Calendar { store.calendar }
    private var snap: Double { 15 }

    var body: some View {
        let events = store.events(on: day).filter { !$0.allDay }
        let items = DayLayout.layout(events.map { .init(id: $0.key, start: $0.start, end: $0.end) }, day: day, calendar: calendar)
        let byKey = Dictionary(uniqueKeysWithValues: events.map { ($0.key, $0) })
        GeometryReader { geo in
            let width = geo.size.width
            ZStack(alignment: .topLeading) {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture(coordinateSpace: .local) { point in
                        create(at: point.y)
                    }
                ForEach(items, id: \.id) { item in
                    if let event = byKey[item.id] {
                        block(event, item, width: width)
                    }
                }
                if calendar.isDateInToday(day) {
                    NowLine(hourHeight: hourHeight)
                }
                // While a day is being planned, every other day steps back.
                if let plan = store.planDay, plan != DayString.string(day) {
                    Color(.systemBackground).opacity(0.55).allowsHitTesting(false)
                }
            }
        }
    }

    @ViewBuilder
    private func block(_ event: CalendarEvent, _ item: DayLayout.Item, width: CGFloat) -> some View {
        let laneWidth = width / CGFloat(item.lanes)
        let x = CGFloat(item.lane) * laneWidth
        let w = laneWidth * CGFloat(item.span)
        let active = drag?.key == event.key ? drag : nil
        let moved = active?.kind == .move ? (active?.minutes ?? 0) : 0
        let stretched = active?.kind == .resize ? (active?.minutes ?? 0) : 0
        let y = (item.startMinute + moved) / 60 * hourHeight
        let h = max((item.endMinute - item.startMinute + stretched) / 60 * hourHeight, 16)
        let dayShift = CGFloat(active?.days ?? 0) * width

        EventBlock(event: event, compact: compact || w < 60, height: h, lifted: active != nil)
            .frame(width: max(w - 2, 4), height: h - 1)
            .overlay(alignment: .bottom) {
                // Only a block tall enough to hold both keeps a handle below its name.
                if event.movable, h >= 40 {
                    Capsule()
                        .fill(.secondary.opacity(active?.kind == .resize ? 0.8 : 0))
                        .frame(width: 24, height: 4)
                        .padding(.bottom, 3)
                        .frame(maxWidth: .infinity, minHeight: 14, maxHeight: 14, alignment: .bottom)
                        .contentShape(Rectangle())
                        .onTapGesture { router.open(event) }
                        .gesture(resizeGesture(event))
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 6))
            .onTapGesture { router.open(event) }
            .gesture(event.movable ? moveGesture(event, width: width) : nil)
            // A held block that can move is carried; one that can't opens its menu instead.
            .blockMenu(event.movable ? nil : event)
            .offset(x: x + 1 + dayShift, y: y)
            .zIndex(active != nil ? 10 : 0)
            .animation(.snappy(duration: 0.18), value: active)
    }

    private func moveGesture(_ event: CalendarEvent, width: CGFloat) -> some Gesture {
        LongPressGesture(minimumDuration: 0.35)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { value in
                guard case .second(true, let dragValue) = value else { return }
                if drag == nil {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    drag = DragState(key: event.key, kind: .move, minutes: 0, days: 0)
                }
                guard let translation = dragValue?.translation else { return }
                let minutes = (Double(translation.height / hourHeight) * 60 / snap).rounded() * snap
                let days = Int((translation.width / width).rounded())
                if minutes != drag?.minutes || days != drag?.days {
                    UISelectionFeedbackGenerator().selectionChanged()
                    drag?.minutes = minutes
                    drag?.days = days
                }
            }
            .onEnded { _ in
                guard let state = drag, state.key == event.key else { return drag = nil }
                drag = nil
                guard state.minutes != 0 || state.days != 0 else { return }
                // Whole days are added on the calendar, so a move across a clock change keeps the hour.
                let start = calendar.date(byAdding: .day, value: state.days, to: event.start)!.addingTimeInterval(state.minutes * 60)
                let end = start.addingTimeInterval(event.end.timeIntervalSince(event.start))
                Task { await store.move(event, start: start, end: end) }
            }
    }

    /// Held first, like a move, so a scroll that starts on a block's lower edge still scrolls.
    private func resizeGesture(_ event: CalendarEvent) -> some Gesture {
        LongPressGesture(minimumDuration: 0.2)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { sequence in
                guard case .second(true, let dragValue) = sequence else { return }
                if drag == nil {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    drag = DragState(key: event.key, kind: .resize, minutes: 0, days: 0)
                }
                guard let value = dragValue else { return }
                let raw = (Double(value.translation.height / hourHeight) * 60 / snap).rounded() * snap
                // Never shorter than a quarter of an hour.
                let minutes = max(raw, snap - Double(event.durationMinutes))
                if minutes != drag?.minutes {
                    UISelectionFeedbackGenerator().selectionChanged()
                    drag?.minutes = minutes
                }
            }
            .onEnded { _ in
                guard let state = drag, state.key == event.key else { return drag = nil }
                drag = nil
                guard state.minutes != 0 else { return }
                Task { await store.move(event, start: event.start, end: event.end.addingTimeInterval(state.minutes * 60)) }
            }
    }

    private func create(at y: CGFloat) {
        let minutes = (Double(y / hourHeight) * 60 / 30).rounded(.down) * 30
        let start = calendar.startOfDay(for: day).addingTimeInterval(minutes * 60)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        onCreate(start)
    }
}

/// The red line at the current minute, across today's column.
struct NowLine: View {
    let hourHeight: CGFloat

    var body: some View {
        TimelineView(.everyMinute) { context in
            let parts = Calendar.current.dateComponents([.hour, .minute], from: context.date)
            let y = CGFloat((parts.hour ?? 0) * 60 + (parts.minute ?? 0)) / 60 * hourHeight
            ZStack(alignment: .leading) {
                Rectangle().fill(.red).frame(height: 1.5)
                Circle().fill(.red).frame(width: 8, height: 8).offset(x: -4)
            }
            .offset(y: y - 0.75)
        }
        .allowsHitTesting(false)
    }
}

/// A block on the grid, tinted by its sphere.
struct EventBlock: View {
    @Environment(Store.self) private var store
    let event: CalendarEvent
    var compact = false
    var height: CGFloat
    var lifted = false

    var body: some View {
        let sphere = store.sphere(of: event)
        let tint = sphere?.tint ?? Color(.systemGray)
        let past = event.end < .now
        let pending = event.response == "needsAction" || event.id.hasPrefix("draft-")
        HStack(spacing: 0) {
            Rectangle().fill(tint).frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                Text(event.title.isEmpty ? "Untitled" : event.title)
                    .font(.caption.weight(.semibold))
                    .lineLimit(height > 44 ? 3 : 1)
                    .strikethrough(event.declined)
                if height > 34, !compact {
                    Text(Format.range(event.start, event.end))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if height > 60, !compact, let location = event.location, !location.isEmpty {
                    Label(location, systemImage: "mappin").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .padding(.horizontal, compact ? 3 : 5)
            .padding(.vertical, 3)
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(tint.opacity(lifted ? 0.4 : 0.2))
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .overlay {
            if pending {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(tint, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            }
        }
        .opacity(past && !lifted ? 0.6 : 1)
        .scaleEffect(lifted ? 1.03 : 1)
        .shadow(color: .black.opacity(lifted ? 0.18 : 0), radius: 8, y: 4)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("block-\(event.title)")
        .accessibilityAddTraits(.isButton)
    }
}

/// What a long press on a block offers without dragging it.
struct BlockMenu: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    let event: CalendarEvent

    var body: some View {
        Button { router.open(event) } label: { Label("Details", systemImage: "info.circle") }
        if event.movable {
            Button {
                let length = event.end.timeIntervalSince(event.start)
                Task {
                    await store.createEvent(.init(
                        title: event.title, start: event.end, end: event.end.addingTimeInterval(length),
                        sphereId: event.activityId == nil ? store.sphere(of: event)?.id : nil,
                        activityId: event.activityId, urn: event.urn
                    ))
                }
            } label: { Label("Duplicate after", systemImage: "plus.square.on.square") }
        }
        Menu {
            ForEach(store.sphereList) { sphere in
                Button { Task { await store.setSphere(event, sphereId: sphere.id) } } label: {
                    Label(sphere.name, systemImage: sphere.symbol)
                }
            }
        } label: { Label("Counts as", systemImage: "circle.lefthalf.filled") }
        if event.movable {
            Button(role: .destructive) { Task { await store.delete(event) } } label: { Label("Delete", systemImage: "trash") }
        }
    }
}

extension View {
    @ViewBuilder func blockMenu(_ event: CalendarEvent?) -> some View {
        if let event { contextMenu { BlockMenu(event: event) } } else { self }
    }
}
