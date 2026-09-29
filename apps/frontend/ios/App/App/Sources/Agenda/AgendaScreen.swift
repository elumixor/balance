import BalanceCore
import SwiftUI

/// The list: today and what follows, events and to-dos together, all of it made and changed by
/// typing. A row is retyped in place by tapping it; the field at the bottom adds anything.
struct AgendaScreen: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router

    @State private var draft = ""
    @State private var draftRevision = 0
    @State private var composing = false
    @State private var editing: String?
    @State private var editText = ""
    @State private var editFocused = false
    @State private var flash: String?
    @AppStorage("agenda.collapsed") private var collapsedRaw = ""
    @State private var now = Date()
    @State private var expanded: Set<String> = []

    private var collapsed: Set<String> {
        Set(collapsedRaw.split(separator: ",").map(String.init))
    }

    private var sections: [AgendaSection] {
        let today = store.calendar.startOfDay(for: now)
        let end = store.calendar.date(byAdding: .day, value: AgendaModel.horizonDays, to: today)!
        return AgendaModel.sections(
            events: store.events(from: today, to: end), tasks: Array(store.tasks.values),
            projects: store.projects, now: now, calendar: store.calendar, ticked: store.ticked
        )
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                List {
                    if let nudge {
                        nudge
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
                    }
                    ForEach(sections) { section in
                        Section {
                            if !collapsed.contains(section.id) {
                                let long = section.items.count > AgendaModel.preview + 2 && !expanded.contains(section.id)
                                ForEach(long ? Array(section.items.prefix(AgendaModel.preview)) : section.items) { item in
                                    row(item, in: section)
                                        .id(item.id)
                                }
                                if long {
                                    Button {
                                        withAnimation(.snappy) { _ = expanded.insert(section.id) }
                                    } label: {
                                        Text("Show \(section.items.count - AgendaModel.preview) more")
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                            .padding(.leading, 64)
                                    }
                                    .buttonStyle(.plain)
                                }
                                if section.kind == .today, section.items.isEmpty {
                                    Text("Nothing yet. Type below — “gym 7pm 45m #health”.")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                        .listRowSeparator(.hidden)
                                }
                            }
                        } header: {
                            SectionHeader(section: section, now: now, collapsed: collapsed.contains(section.id)) {
                                toggle(section.id)
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollDismissesKeyboard(.interactively)
                .environment(\.defaultMinListRowHeight, 44)
                .animation(.snappy, value: sections.map(\.items))
                .refreshable { await store.refresh() }
                .onChange(of: flash) { _, id in
                    guard let id else { return }
                    withAnimation(.smooth) { proxy.scrollTo(id, anchor: .center) }
                }
            }
            .navigationTitle("Today")
            .subtitle(now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { router.sessionOpen = store.session?.slot ?? store.sessionSlot } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "star.fill")
                            Text("\(store.session?.rank.stars ?? 0)").monospacedDigit()
                        }
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 4)
                    }
                    .accessibilityIdentifier("starsButton")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { router.settingsOpen = true } label: {
                        Image(systemName: "person.crop.circle")
                    }
                    .accessibilityIdentifier("settingsButton")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if editing == nil { composer }
            }
            .task {
                await store.ensureWeeks(around: store.calendar.date(byAdding: .day, value: 7, to: now)!)
            }
            .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { now = $0 }
        }
    }

    /// The sitting, offered while it is due: the slot has come round and its day isn't planned.
    private var nudge: AnyView? {
        guard let summary = store.session, !summary.target.planned, summary.connected else { return nil }
        let label = summary.slot == .morning ? "Morning plan" : summary.slot == .weekly ? "Week review" : "Evening review"
        return AnyView(
            Button { router.sessionOpen = summary.slot } label: {
                HStack(spacing: 12) {
                    Image(systemName: summary.slot == .morning ? "sunrise" : "moon.stars")
                        .font(.title3)
                        .frame(width: 36, height: 36)
                        .background(Color(.tertiarySystemFill), in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label).font(.subheadline.weight(.semibold))
                        Text("Plan \(summary.nextDayWord)").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if summary.planStars > 0 {
                        Label("+\(summary.planStars)", systemImage: "star.fill")
                            .labelStyle(.titleAndIcon)
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                            .foregroundStyle(.yellow)
                    }
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                }
                .padding(12)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("sessionNudge")
        )
    }

    // MARK: Rows

    @ViewBuilder
    private func row(_ item: AgendaItem, in section: AgendaSection) -> some View {
        if editing == item.id {
            editor(for: item)
                .listRowBackground(Color(.secondarySystemBackground))
        } else {
            switch item {
            case .event(let event):
                EventRow(event: event, now: now, showDay: section.kind == .week || section.kind == .later)
                    .contentShape(Rectangle())
                    .onTapGesture { beginEdit(item) }
                    .listRowBackground(flash == item.id ? Color.primary.opacity(0.06) : Color.clear)
                    .swipeActions(edge: .trailing) {
                        if event.movable {
                            Button(role: .destructive) { Task { await store.delete(event) } } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                    .swipeActions(edge: .leading) {
                        Button { router.open(event) } label: { Label("Details", systemImage: "info.circle") }
                            .tint(.gray)
                    }
                    .contextMenu {
                        Button { beginEdit(item) } label: { Label("Retype", systemImage: "character.cursor.ibeam") }
                        Button { router.open(event) } label: { Label("Details", systemImage: "info.circle") }
                        Button { router.show(day: event.start) } label: { Label("Show in calendar", systemImage: "calendar") }
                        if event.movable {
                            Button(role: .destructive) { Task { await store.delete(event) } } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
            case .task(let task):
                TaskRow(task: task, showDay: section.kind != .today && section.kind != .tomorrow) {
                    toggleDone(task)
                }
                .contentShape(Rectangle())
                .onTapGesture { beginEdit(item) }
                .listRowBackground(flash == item.id ? Color.primary.opacity(0.06) : Color.clear)
                .swipeActions(edge: .leading) {
                    Button { toggleDone(task) } label: {
                        Label(task.isDone ? "Not done" : "Done", systemImage: task.isDone ? "arrow.uturn.backward" : "checkmark")
                    }
                    .tint(.green)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) { store.deleteTask(task) } label: { Label("Delete", systemImage: "trash") }
                }
                .contextMenu {
                    Button { beginEdit(item) } label: { Label("Retype", systemImage: "character.cursor.ibeam") }
                    Button { toggleDone(task) } label: { Label(task.isDone ? "Not done" : "Done", systemImage: "checkmark.circle") }
                    Button(role: .destructive) { store.deleteTask(task) } label: { Label("Delete", systemImage: "trash") }
                }
            }
        }
    }

    private func editor(for item: AgendaItem) -> some View {
        HStack(alignment: .top, spacing: 8) {
            LineEditor(
                text: $editText, focused: $editFocused, placeholder: "Retype it", showPreview: false,
                onSubmit: { commitEdit(item, $0) }, onCancel: { cancelEdit() }
            )
            if case .event(let event) = item {
                Button { commitEdit(item, nil); router.open(event) } label: {
                    Image(systemName: "info.circle").font(.title3)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(.top, 8)
                .accessibilityLabel("Details")
            }
        }
        .onChange(of: editFocused) { _, focused in
            if !focused, editing == item.id { commitEdit(item, nil) }
        }
    }

    private func beginEdit(_ item: AgendaItem) {
        if let editing, editing != item.id, let current = currentItem(editing) { commitEdit(current, nil) }
        // A trailing space, so whatever is typed next is a word of its own.
        editText = LineActions.text(for: item, in: store) + " "
        editing = item.id
        editFocused = true
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private func currentItem(_ id: String) -> AgendaItem? {
        sections.flatMap(\.items).first { $0.id == id }
    }

    private func commitEdit(_ item: AgendaItem, _ submitted: TypedLine?) {
        guard editing == item.id else { return }
        let original = LineActions.text(for: item, in: store)
        let text = editText
        editing = nil
        editFocused = false
        guard text.trimmingCharacters(in: .whitespaces) != original else { return }
        let line = submitted ?? LineReader.read(text, vocabulary: store.vocabulary)
        Task { await LineActions.apply(line, to: item, in: store) }
    }

    private func cancelEdit() {
        editing = nil
        editFocused = false
    }

    private func toggleDone(_ task: TaskItem) {
        let done = !task.isDone
        withAnimation(.snappy) { store.setDone(task, done) }
        if done { UINotificationFeedbackGenerator().notificationOccurred(.success) } else { UISelectionFeedbackGenerator().selectionChanged() }
    }

    private func toggle(_ id: String) {
        var set = collapsed
        if set.contains(id) { set.remove(id) } else { set.insert(id) }
        withAnimation(.snappy) { collapsedRaw = set.sorted().joined(separator: ",") }
    }

    // MARK: Composer

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            LineEditor(
                text: $draft, focused: $composing, placeholder: "Add anything — gym 7pm 45m #health", revision: draftRevision,
                defaultProject: LineActions.defaultProject(in: store),
                onSubmit: { submit($0) }
            )
            Button { submit(LineReader.read(draft, vocabulary: store.vocabulary)) } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
                    .symbolRenderingMode(.hierarchical)
            }
            .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            .padding(.bottom, 4)
            .accessibilityIdentifier("addButton")
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
    }

    private func submit(_ line: TypedLine) {
        guard !line.title.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        draft = ""
        draftRevision += 1
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task {
            if let item = await LineActions.create(line, in: store) {
                flash = item.id
                try? await Task.sleep(for: .seconds(1.2))
                if flash == item.id { withAnimation(.smooth) { flash = nil } }
            }
        }
    }
}

// MARK: - Header

private struct SectionHeader: View {
    let section: AgendaSection
    let now: Date
    let collapsed: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 8) {
                Text(section.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                if !section.items.isEmpty {
                    ProgressRing(progress: section.progress(now: now))
                        .frame(width: 14, height: 14)
                    Text("\(section.items.count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(collapsed ? -90 : 0))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("section-\(section.id)")
    }
}

struct ProgressRing: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle().stroke(Color(.systemFill), lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(Color.primary, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .animation(.smooth, value: progress)
    }
}

extension View {
    /// The date under the title, where the system draws one.
    @ViewBuilder func subtitle(_ text: String) -> some View {
        if #available(iOS 26, *) { navigationSubtitle(text) } else { self }
    }
}
