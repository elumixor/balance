import BalanceKit
import SwiftUI

/// The week as a dial: each sphere an arc sized by the hours it was given, filled as far as the
/// calendar has spent them — the same ring the watch and its widget draw, from the same layout.
struct BalanceScreen: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var weekStart = Date()
    @State private var summary: WatchSummary?
    @State private var loading = false
    @State private var selected: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    weekSwitcher
                    if let summary {
                        let layout = DialLayout(categories: summary.categories)
                        WeekDial(layout: layout, selected: $selected)
                            .frame(width: 260, height: 260)
                            .overlay { center(summary) }
                            .padding(.vertical, 8)
                        VStack(spacing: 0) {
                            ForEach(summary.categories) { category in
                                SphereRow(category: category, selected: selected == category.id)
                                    .contentShape(Rectangle())
                                    .onTapGesture { withAnimation(.snappy) { selected = selected == category.id ? nil : category.id } }
                                Divider().padding(.leading, 44)
                            }
                        }
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    } else if loading {
                        ProgressView().padding(60)
                    }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Balance")
            .refreshable { await load() }
            .task(id: weekStart) { await load() }
            .onAppear { weekStart = store.weekStart(.now) }
            .onChange(of: store.eventsVersion) { _, _ in Task { await load() } }
        }
    }

    private var weekSwitcher: some View {
        HStack {
            Button { shift(-1) } label: { Image(systemName: "chevron.left") }
            Spacer()
            VStack(spacing: 2) {
                Text(weekTitle).font(.headline)
                Text(weekRange).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button { shift(1) } label: { Image(systemName: "chevron.right") }
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.circle)
    }

    private var weekTitle: String {
        let current = store.weekStart(.now)
        if weekStart == current { return "This week" }
        let weeks = (store.calendar.dateComponents([.day], from: current, to: weekStart).day ?? 0) / 7
        if weeks == -1 { return "Last week" }
        if weeks == 1 { return "Next week" }
        return weeks < 0 ? "\(-weeks) weeks ago" : "In \(weeks) weeks"
    }

    private var weekRange: String {
        let end = store.calendar.date(byAdding: .day, value: 6, to: weekStart)!
        return "\(weekStart.formatted(.dateTime.day().month(.abbreviated))) – \(end.formatted(.dateTime.day().month(.abbreviated)))"
    }

    private func shift(_ weeks: Int) {
        weekStart = store.calendar.date(byAdding: .day, value: 7 * weeks, to: weekStart)!
        UISelectionFeedbackGenerator().selectionChanged()
    }

    @ViewBuilder
    private func center(_ summary: WatchSummary) -> some View {
        let focus = summary.categories.first { $0.id == selected }
        let actual = focus?.actualHours ?? summary.categories.reduce(0) { $0 + $1.actualHours }
        let target = focus?.targetHours ?? summary.categories.reduce(0) { $0 + $1.targetHours }
        VStack(spacing: 2) {
            Text(focus?.name ?? "Planned hours spent")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("\(hoursText(actual))h")
                .font(.system(size: 40, weight: .semibold, design: .rounded).monospacedDigit())
                .contentTransition(.numericText())
            Text("of \(hoursText(target))h")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .animation(.snappy, value: selected)
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let answer = try await store.backend.weekSummary(weekStart: weekStart)
            withAnimation(.smooth) { summary = answer }
        } catch {
            store.report(error, "Couldn't load the week")
        }
    }
}

/// The ring itself: an arc per sphere, the spent part solid over a faint whole.
private struct WeekDial: View {
    let layout: DialLayout<WatchCategory>
    @Binding var selected: String?

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            let line: CGFloat = 22
            ZStack {
                ForEach(layout.segments) { segment in
                    let color = Color(hex: segment.category.color)
                    let gap = 0.006
                    let dim = selected != nil && selected != segment.id
                    Circle()
                        .trim(from: segment.start + gap, to: segment.end - gap)
                        .stroke(color.opacity(0.18), style: StrokeStyle(lineWidth: line, lineCap: .butt))
                    Circle()
                        .trim(from: segment.start + gap, to: segment.start + gap + max(0, segment.span - 2 * gap) * segment.category.dialFill)
                        .stroke(color, style: StrokeStyle(lineWidth: line, lineCap: .butt))
                        .opacity(dim ? 0.35 : 1)
                    if segment.category.dialOverflow > 0 {
                        Circle()
                            .trim(from: segment.start + gap, to: segment.start + gap + max(0, segment.span - 2 * gap) * segment.category.dialOverflow)
                            .stroke(color.opacity(0.9), style: StrokeStyle(lineWidth: 5, lineCap: .round))
                            .padding(-line / 2 - 6)
                            .opacity(dim ? 0.35 : 1)
                    }
                }
            }
            .rotationEffect(.degrees(-90))
            .padding(line / 2)
            .frame(width: size, height: size)
            .contentShape(Circle())
            .gesture(SpatialTapGesture().onEnded { value in
                let dx = value.location.x - size / 2, dy = value.location.y - size / 2
                var turn = atan2(dx, -dy) / (2 * .pi)
                if turn < 0 { turn += 1 }
                if let index = layout.index(at: turn), let segment = layout.segment(at: index) {
                    withAnimation(.snappy) { selected = selected == segment.id ? nil : segment.id }
                    UISelectionFeedbackGenerator().selectionChanged()
                }
            })
            .animation(.smooth, value: layout)
        }
    }
}

private struct SphereRow: View {
    let category: WatchCategory
    let selected: Bool

    var body: some View {
        let color = Color(hex: category.color)
        HStack(spacing: 12) {
            Image(systemName: Icons.symbol(for: category.icon))
                .font(.subheadline)
                .foregroundStyle(color)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(category.name).font(.body.weight(selected ? .semibold : .regular))
                    Spacer()
                    Text("\(hoursText(category.actualHours)) / \(hoursText(category.targetHours))h")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(color.opacity(0.15))
                        Capsule().fill(color).frame(width: geo.size.width * min(category.ratio, 1))
                    }
                }
                .frame(height: 5)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .background(selected ? color.opacity(0.08) : .clear)
    }
}
