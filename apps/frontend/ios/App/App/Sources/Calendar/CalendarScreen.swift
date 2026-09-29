import BalanceCore
import SwiftUI

/// The calendar: a day, three days or a week at a time, swiped through sideways.
///
/// One vertical scroll holds the hour gutter and a sideways pager of pages, so every page is
/// always at the same hour — there is only one vertical offset to keep. The day headers sit above
/// it and follow the pager's offset frame by frame rather than paging on their own. A block is
/// pressed to open its card, held to carry it, held by its lower edge to lengthen it; an empty
/// hour is tapped to type a new one into it.
struct CalendarScreen: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router

    enum Mode: String, CaseIterable, Identifiable {
        case day = "Day", three = "3 Days", week = "Week"
        var id: String { rawValue }
        var days: Int { self == .day ? 1 : self == .three ? 3 : 7 }
    }

    @AppStorage("calendar.mode") private var mode: Mode = .three
    @AppStorage("calendar.hourHeight") private var hourHeight: Double = 56
    @State private var anchor = Calendar.current.startOfDay(for: .now)
    @State private var page: Int? = 0
    @State private var pagerX: CGFloat = 0
    @State private var pageWidth: CGFloat = 1
    @State private var vertical = ScrollPosition(y: 0)
    @State private var scrolledToNow = false
    @State private var newBlock: NewBlock?
    @State private var pinchBase: Double?

    static let pageRange = -400...400
    static let gutter: CGFloat = 44

    struct NewBlock: Identifiable {
        let start: Date
        let end: Date
        var id: Date { start }
    }

    private var calendar: Calendar { store.calendar }

    func pageStart(_ index: Int) -> Date {
        calendar.date(byAdding: .day, value: index * mode.days, to: anchor)!
    }

    private var currentStart: Date { pageStart(page ?? 0) }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                Divider()
                grid
            }
            .navigationTitle(currentStart.formatted(.dateTime.month(.wide).year()))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .sheet(item: $newBlock) { block in
                QuickCreateSheet(start: block.start, end: block.end)
                    .presentationDetents([.height(190), .medium])
                    .presentationBackgroundInteraction(.enabled(upThrough: .height(190)))
            }
            .onAppear { align(to: anchor) }
            .onChange(of: mode) { _, _ in align(to: currentStart) }
            .onChange(of: page) { _, _ in load() }
            .onChange(of: router.calendarFocus) { _, focus in
                guard let focus else { return }
                align(to: focus)
                scroll(toHour: calendar.component(.hour, from: focus) - 1, animated: true)
                router.calendarFocus = nil
            }
        }
    }

    // MARK: Paging

    /// Makes `date`'s page the one at index 0 — its week's Monday in week mode, the day itself
    /// otherwise — so every page after it is a whole number of pages away.
    private func align(to date: Date) {
        let day = calendar.startOfDay(for: date)
        anchor = mode == .week ? store.weekStart(day) : day
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { page = 0 }
        load()
    }

    private func load() {
        let start = currentStart
        Task { await store.ensureWeeks(around: start) }
    }

    private func goToday() {
        align(to: .now)
        scroll(toHour: calendar.component(.hour, from: .now) - 1, animated: true)
    }

    private func scroll(toHour hour: Int, animated: Bool) {
        let y = max(0, CGFloat(hour) * hourHeight)
        if animated { withAnimation(.smooth) { vertical.scrollTo(y: y) } } else { vertical.scrollTo(y: y) }
    }

    // MARK: Header

    /// The day names, drawn for the pages either side of where the pager is and slid by its
    /// offset — so they move under the finger rather than jumping when a page lands.
    private var header: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: Self.gutter)
            GeometryReader { geo in
                let w = max(geo.size.width, 1)
                let position = pagerX / w + CGFloat(Self.pageRange.lowerBound)
                let first = Int(floor(position))
                ZStack(alignment: .topLeading) {
                    ForEach(first - 1...first + 2, id: \.self) { index in
                        DayHeaderRow(start: pageStart(index), days: mode.days)
                            .frame(width: w)
                            .offset(x: (CGFloat(index) - position) * w)
                    }
                }
                .frame(width: w, alignment: .topLeading)
                .clipped()
            }
        }
        .frame(height: headerHeight)
        .background(Color(.systemBackground))
    }

    private var headerHeight: CGFloat {
        let allDay = (0..<mode.days).contains { offset in
            store.events(on: calendar.date(byAdding: .day, value: offset, to: currentStart)!).contains(where: \.allDay)
        }
        return allDay ? 78 : 52
    }

    // MARK: Grid

    private var grid: some View {
        ScrollView(.vertical) {
            HStack(alignment: .top, spacing: 0) {
                HourGutter(hourHeight: hourHeight)
                    .frame(width: Self.gutter)
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 0) {
                        ForEach(Self.pageRange, id: \.self) { index in
                            DaysPage(
                                start: pageStart(index), days: mode.days, hourHeight: hourHeight,
                                onCreate: { start in
                                    newBlock = NewBlock(start: start, end: start.addingTimeInterval(3600))
                                }
                            )
                            .containerRelativeFrame(.horizontal)
                            .id(index)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: $page)
                .scrollIndicators(.hidden)
                .onScrollGeometryChange(for: CGFloat.self, of: { $0.contentOffset.x }) { _, x in pagerX = x }
                .onGeometryChange(for: CGFloat.self, of: { $0.size.width }) { pageWidth = $0 }
            }
            .frame(height: hourHeight * 24)
        }
        .scrollPosition($vertical)
        .scrollIndicators(.hidden)
        .simultaneousGesture(
            MagnifyGesture()
                .onChanged { value in
                    let base = pinchBase ?? hourHeight
                    pinchBase = base
                    hourHeight = min(max(base * value.magnification, 28), 160)
                }
                .onEnded { _ in pinchBase = nil }
        )
        .onAppear {
            guard !scrolledToNow else { return }
            scrolledToNow = true
            scroll(toHour: calendar.component(.hour, from: .now) - 1, animated: false)
        }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button("Today") { goToday() }
                .accessibilityIdentifier("todayButton")
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Menu {
                Picker("View", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
            } label: {
                Image(systemName: mode == .day ? "rectangle" : mode == .three ? "rectangle.split.3x1" : "calendar.day.timeline.left")
            }
            .accessibilityIdentifier("modeMenu")
            Button {
                let start = nextFreeHour()
                newBlock = NewBlock(start: start, end: start.addingTimeInterval(3600))
            } label: {
                Image(systemName: "plus")
            }
            .accessibilityIdentifier("newEventButton")
        }
    }

    /// The top of the next hour on the first visible day — today when today is showing.
    private func nextFreeHour() -> Date {
        let now = Date()
        let visible = (0..<mode.days).map { calendar.date(byAdding: .day, value: $0, to: currentStart)! }
        let day = visible.first { calendar.isDateInToday($0) } ?? visible[0]
        let hour = calendar.isDateInToday(day) ? min(calendar.component(.hour, from: now) + 1, 23) : 9
        return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day)!
    }
}

// MARK: - Header row

private struct DayHeaderRow: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    let start: Date
    let days: Int

    var body: some View {
        let calendar = store.calendar
        let dates = (0..<days).map { calendar.date(byAdding: .day, value: $0, to: start)! }
        VStack(spacing: 4) {
            HStack(spacing: 0) {
                ForEach(dates, id: \.self) { date in
                    let today = calendar.isDateInToday(date)
                    VStack(spacing: 2) {
                        Text(date.formatted(.dateTime.weekday(days == 7 ? .narrow : .abbreviated)))
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(today ? .primary : .secondary)
                        Text(date.formatted(.dateTime.day()))
                            .font(.callout.weight(today ? .bold : .regular).monospacedDigit())
                            .foregroundStyle(today ? Color(.systemBackground) : .primary)
                            .frame(width: 28, height: 28)
                            .background(today ? Color.primary : .clear, in: Circle())
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 4)
            AllDayRow(dates: dates)
        }
    }
}

/// All-day blocks for the page's days, each a capsule across the days it covers.
private struct AllDayRow: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    let dates: [Date]

    var body: some View {
        let calendar = store.calendar
        let first = dates[0]
        let end = calendar.date(byAdding: .day, value: dates.count, to: first)!
        let events = store.events(from: first, to: end).filter(\.allDay)
        GeometryReader { geo in
            let w = geo.size.width / CGFloat(dates.count)
            ForEach(Array(events.prefix(2).enumerated()), id: \.element.key) { index, event in
                let from = max(0, calendar.dateComponents([.day], from: first, to: event.start).day ?? 0)
                let to = min(dates.count, calendar.dateComponents([.day], from: first, to: event.end).day ?? dates.count)
                let sphere = store.sphere(of: event)
                Text(event.title)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .padding(.horizontal, 6)
                    .frame(width: max(CGFloat(to - from) * w - 3, 20), height: 18, alignment: .leading)
                    .background((sphere?.tint ?? .gray).opacity(0.22), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                    .offset(x: CGFloat(from) * w + 1.5, y: CGFloat(index) * 10)
                    .onTapGesture { router.open(event) }
            }
        }
        .frame(height: events.isEmpty ? 0 : 22)
        .clipped()
    }
}

// MARK: - Gutter

private struct HourGutter: View {
    let hourHeight: CGFloat

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ForEach(1..<24, id: \.self) { hour in
                Text(label(hour))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .padding(.trailing, 6)
                    .offset(y: CGFloat(hour) * hourHeight - 7)
            }
            NowGutterLabel(hourHeight: hourHeight)
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private func label(_ hour: Int) -> String {
        let date = Calendar.current.date(bySettingHour: hour, minute: 0, second: 0, of: .now)!
        return Format.uses24h ? String(format: "%02d:00", hour) : date.formatted(.dateTime.hour())
    }
}

private struct NowGutterLabel: View {
    let hourHeight: CGFloat

    var body: some View {
        TimelineView(.everyMinute) { context in
            let minutes = Calendar.current.dateComponents([.hour, .minute], from: context.date)
            let y = CGFloat((minutes.hour ?? 0) * 60 + (minutes.minute ?? 0)) / 60 * hourHeight
            Text(Format.time(context.date))
                .font(.caption2.weight(.bold).monospacedDigit())
                .foregroundStyle(.red)
                .padding(.horizontal, 3)
                .background(Color(.systemBackground))
                .offset(y: y - 7)
                .padding(.trailing, 2)
        }
    }
}
