import BalanceKit
import MapKit
import SwiftUI

/// An event's card: a sheet that opens half-way over the calendar or the list, with what matters
/// most at the top — its name, when it is, what it counts as, how to get there or join — and the
/// rest a scroll away. Every change is written as it is made; there is no Save.
struct EventSheet: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    let eventKey: String

    @State private var title = ""
    @State private var location = ""
    @State private var notes = ""
    @State private var start = Date()
    @State private var end = Date()
    @State private var loadedKey: String?
    @State private var pendingSeriesChange: [String: JSON]?
    @State private var confirmDelete = false
    @State private var timeWrite: Task<Void, Never>?
    @State private var notesWrite: Task<Void, Never>?
    @FocusState private var focus: Field?
    @State private var detent: PresentationDetent = .medium

    enum Field { case title, location, notes }

    private var event: CalendarEvent? { store.event(key: eventKey) }

    var body: some View {
        NavigationStack {
            Group {
                if let event {
                    content(event)
                } else {
                    ContentUnavailableView("This event is gone", systemImage: "calendar.badge.exclamationmark")
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityIdentifier("closeEvent")
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        .onAppear(perform: load)
        .onChange(of: eventKey) { _, _ in load() }
        .onDisappear { flush() }
    }

    private func load() {
        guard let event, loadedKey != event.key else { return }
        loadedKey = event.key
        title = event.title
        location = event.location ?? ""
        notes = event.notes ?? ""
        start = event.start
        end = event.end
    }

    // MARK: Layout

    private func content(_ event: CalendarEvent) -> some View {
        let sphere = store.sphere(of: event)
        return List {
            Section {
                header(event, sphere: sphere)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 12, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            if event.invited { invitation(event) }

            Section("Counts as") {
                SpherePicker(event: event)
                    .listRowInsets(EdgeInsets(top: 10, leading: 0, bottom: 10, trailing: 0))
                projectRow(event)
            }

            Section("When") { timeRows(event) }

            Section("Where") { placeRows(event) }

            if !event.attendees.isEmpty { guests(event) }

            Section {
                ZStack(alignment: .topLeading) {
                    if notes.isEmpty {
                        Text("Only you see these").foregroundStyle(.tertiary).padding(.top, 8).allowsHitTesting(false)
                    }
                    TextEditor(text: $notes)
                        .focused($focus, equals: .notes)
                        .frame(minHeight: 80)
                        .scrollContentBackground(.hidden)
                        .accessibilityIdentifier("notesField")
                }
                .onChange(of: notes) { _, _ in scheduleNotes(event) }
            } header: {
                Text("Notes")
            }

            if let description = event.description, !description.isEmpty {
                Section("Description") {
                    Text(attributed(description))
                        .font(.callout)
                        .textSelection(.enabled)
                }
            }

            if event.movable {
                Section {
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label("Delete event", systemImage: "trash").frame(maxWidth: .infinity)
                    }
                    .accessibilityIdentifier("deleteEvent")
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(.compact)
        .scrollDismissesKeyboard(.interactively)
        .confirmationDialog("Delete “\(event.title)”?", isPresented: $confirmDelete, titleVisibility: .visible) {
            if event.isRepeating {
                Button("Only this event", role: .destructive) { delete(event, .this) }
                Button("This and following", role: .destructive) { delete(event, .following) }
                Button("All events", role: .destructive) { delete(event, .all) }
            } else {
                Button("Delete", role: .destructive) { delete(event, .this) }
            }
        }
        .confirmationDialog("Change the repeating event", isPresented: Binding(
            get: { pendingSeriesChange != nil }, set: { if !$0 { pendingSeriesChange = nil } }
        ), titleVisibility: .visible) {
            Button("Only this event") { commitSeries(event, .this) }
            Button("This and following") { commitSeries(event, .following) }
            Button("All events") { commitSeries(event, .all) }
            Button("Cancel", role: .cancel) {
                title = event.title
                location = event.location ?? ""
                pendingSeriesChange = nil
            }
        }
    }

    private func header(_ event: CalendarEvent, sphere: Sphere?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Circle().fill(sphere?.tint ?? Color(.systemGray3)).frame(width: 12, height: 12)
                TextField("Title", text: $title, axis: .vertical)
                    .font(.title2.weight(.semibold))
                    .focused($focus, equals: .title)
                    .submitLabel(.done)
                    .disabled(!event.movable)
                    .onSubmit { commitTitle(event) }
                    .onChange(of: focus) { old, _ in if old == .title { commitTitle(event) } }
                    .accessibilityIdentifier("eventTitle")
            }
            Text(whenText(event))
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
            if !event.movable {
                Label(event.readOnly ? "This calendar is read-only." : "Only the organizer can move this.", systemImage: "lock")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            actions(event)
        }
    }

    private func actions(_ event: CalendarEvent) -> some View {
        HStack(spacing: 10) {
            if let url = event.conferenceUrl.flatMap(URL.init(string:)) {
                ActionButton(title: "Join", symbol: "video.fill", prominent: true) { UIApplication.shared.open(url) }
            }
            if let place = event.location, !place.isEmpty {
                ActionButton(title: "Directions", symbol: "car.fill") { openMaps(place) }
            }
            ActionButton(title: "Show", symbol: "calendar") {
                dismiss()
                router.show(day: event.start)
            }
        }
        .padding(.top, 4)
    }

    private func whenText(_ event: CalendarEvent) -> String {
        if event.allDay {
            let days = max(1, store.calendar.dateComponents([.day], from: event.start, to: event.end).day ?? 1)
            return days > 1 ? "\(Format.day(event.start)) · \(days) days" : "\(Format.day(event.start)) · all day"
        }
        return "\(Format.day(event.start)) · \(Format.range(event.start, event.end)) · \(Format.duration(minutes: event.durationMinutes))"
    }

    // MARK: Sections

    private func invitation(_ event: CalendarEvent) -> some View {
        Section {
            Picker("Going?", selection: Binding(
                get: { event.response ?? "needsAction" },
                set: { answer in Task { await store.respond(event, answer) } }
            )) {
                Text("Going").tag("accepted")
                Text("Maybe").tag("tentative")
                Text("No").tag("declined")
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("rsvp")
        } header: {
            Text(event.organizer.map { "Invited by \($0.displayName)" } ?? "Invitation")
        }
    }

    private func projectRow(_ event: CalendarEvent) -> some View {
        Menu {
            Button("None") { setProject(event, nil) }
            ForEach(store.activeProjects) { project in
                Button(project.name) { setProject(event, project.id) }
            }
        } label: {
            HStack {
                Label("Project", systemImage: "folder")
                Spacer()
                Text(event.projectId.flatMap { store.projects[$0]?.name } ?? "None")
                    .foregroundStyle(.secondary)
                Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(.tertiary)
            }
        }
        .tint(.primary)
        .accessibilityIdentifier("projectMenu")
    }

    @ViewBuilder
    private func timeRows(_ event: CalendarEvent) -> some View {
        if event.allDay {
            LabeledContent("Starts", value: event.start.formatted(date: .abbreviated, time: .omitted))
            LabeledContent("Ends", value: store.calendar.date(byAdding: .day, value: -1, to: event.end)!.formatted(date: .abbreviated, time: .omitted))
        } else {
            DatePicker("Starts", selection: $start, displayedComponents: [.date, .hourAndMinute])
                .disabled(!event.movable)
                .onChange(of: start) { old, new in
                    guard loadedKey == event.key, new != event.start else { return }
                    // Moving the start carries the end with it, the way dragging a block does.
                    end = end.addingTimeInterval(new.timeIntervalSince(old))
                    scheduleTime(event)
                }
            DatePicker("Ends", selection: $end, in: start.addingTimeInterval(300)..., displayedComponents: [.date, .hourAndMinute])
                .disabled(!event.movable)
                .onChange(of: end) { _, new in
                    guard loadedKey == event.key, new != event.end else { return }
                    scheduleTime(event)
                }
        }
        if let rule = event.recurrence?.first {
            LabeledContent("Repeats", value: RecurrenceText.describe(rule))
        } else if event.isRepeating {
            LabeledContent("Repeats", value: "Yes")
        }
        if !event.reminders.isEmpty {
            LabeledContent("Reminders", value: event.reminders.map { $0.minutes == 0 ? "at start" : "\(Format.duration(minutes: $0.minutes)) before" }.joined(separator: ", "))
        }
    }

    @ViewBuilder
    private func placeRows(_ event: CalendarEvent) -> some View {
        HStack {
            Image(systemName: "mappin.and.ellipse").foregroundStyle(.secondary)
            TextField("Add a place", text: $location)
                .focused($focus, equals: .location)
                .submitLabel(.done)
                .disabled(!event.movable)
                .onSubmit { commitLocation(event) }
                .onChange(of: focus) { old, _ in if old == .location { commitLocation(event) } }
        }
        if let url = event.conferenceUrl, let link = URL(string: url) {
            Link(destination: link) {
                Label(event.conferenceName ?? "Join the call", systemImage: "video")
            }
        } else if event.movable {
            Button {
                Task { await store.patch(event, ["conference": .string("create")]) }
            } label: {
                Label("Add a Google Meet call", systemImage: "video.badge.plus")
            }
        }
    }

    private func guests(_ event: CalendarEvent) -> some View {
        Section("Guests") {
            ForEach(event.attendees, id: \.self) { person in
                HStack {
                    Initials(name: person.displayName)
                    VStack(alignment: .leading) {
                        Text(person.displayName + (person.isSelf ? " (you)" : ""))
                        if let email = person.email, person.name != nil {
                            Text(email).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Image(systemName: responseSymbol(person.response))
                        .foregroundStyle(person.response == "accepted" ? .green : person.response == "declined" ? .red : .secondary)
                }
            }
        }
    }

    private func responseSymbol(_ response: String) -> String {
        switch response {
        case "accepted": return "checkmark.circle.fill"
        case "declined": return "xmark.circle.fill"
        case "tentative": return "questionmark.circle.fill"
        default: return "circle.dotted"
        }
    }

    // MARK: Writes

    private func commitTitle(_ event: CalendarEvent) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard event.movable, !trimmed.isEmpty, trimmed != event.title else { return }
        change(event, ["title": .string(trimmed)])
    }

    private func commitLocation(_ event: CalendarEvent) {
        let trimmed = location.trimmingCharacters(in: .whitespacesAndNewlines)
        guard event.movable, trimmed != (event.location ?? "") else { return }
        change(event, ["location": .string(trimmed)])
    }

    /// A repeating event asks how far a change reaches before it is written.
    private func change(_ event: CalendarEvent, _ fields: [String: JSON]) {
        if event.isRepeating {
            pendingSeriesChange = fields
            return
        }
        write(event, fields, .this)
    }

    private func commitSeries(_ event: CalendarEvent, _ scope: Store.SeriesScope) {
        guard let fields = pendingSeriesChange else { return }
        pendingSeriesChange = nil
        write(event, fields, scope)
    }

    private func write(_ event: CalendarEvent, _ fields: [String: JSON], _ scope: Store.SeriesScope) {
        Task {
            await store.patch(event, fields, scope: scope) { drawn in
                if case .string(let t)? = fields["title"] { drawn.title = t }
                if case .string(let l)? = fields["location"] { drawn.location = l.isEmpty ? nil : l }
            }
        }
    }

    private func scheduleTime(_ event: CalendarEvent) {
        timeWrite?.cancel()
        timeWrite = Task {
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            await commitTime(event)
        }
    }

    private func commitTime(_ event: CalendarEvent) async {
        guard let current = store.event(key: event.key), start != current.start || end != current.end, end > start else { return }
        let (s, e) = (start, end)
        await store.move(current, start: s, end: e)
    }

    private func scheduleNotes(_ event: CalendarEvent) {
        guard loadedKey == event.key else { return }
        notesWrite?.cancel()
        notesWrite = Task {
            try? await Task.sleep(for: .milliseconds(900))
            guard !Task.isCancelled else { return }
            await commitNotes(event)
        }
    }

    private func commitNotes(_ event: CalendarEvent) async {
        guard let current = store.event(key: event.key), notes != (current.notes ?? "") else { return }
        let value = notes
        await store.map(current, ["notes": value.isEmpty ? .null : .string(value)]) { $0.notes = value.isEmpty ? nil : value }
    }

    /// Whatever is still waiting when the card closes is written now rather than dropped.
    private func flush() {
        guard let event else { return }
        if timeWrite != nil {
            timeWrite?.cancel()
            Task { await commitTime(event) }
        }
        if notesWrite != nil {
            notesWrite?.cancel()
            Task { await commitNotes(event) }
        }
        if focus == .title { commitTitle(event) }
        if focus == .location { commitLocation(event) }
    }

    private func setProject(_ event: CalendarEvent, _ id: String?) {
        Task { await store.map(event, ["projectId": .from(id)]) { $0.projectId = id } }
    }

    private func delete(_ event: CalendarEvent, _ scope: Store.SeriesScope) {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        dismiss()
        Task { await store.delete(event, scope: scope) }
    }

    private func openMaps(_ place: String) {
        let query = place.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? place
        if let url = URL(string: "maps://?daddr=\(query)") { UIApplication.shared.open(url) }
    }

    private func attributed(_ text: String) -> AttributedString {
        // Google hands descriptions over as light HTML; the tags are dropped, the links kept.
        let plain = text
            .replacingOccurrences(of: "<br>", with: "\n")
            .replacingOccurrences(of: "<br/>", with: "\n")
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        var result = AttributedString(plain)
        if let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) {
            for match in detector.matches(in: plain, range: NSRange(plain.startIndex..., in: plain)) {
                if let range = Range(match.range, in: plain), let r = Range(range, in: result), let url = match.url {
                    result[r].link = url
                }
            }
        }
        return result
    }
}

/// The spheres an hour can count toward, as a row of chips, and the activities after them.
struct SpherePicker: View {
    @Environment(Store.self) private var store
    let event: CalendarEvent

    var body: some View {
        let current = event.activityId == nil ? store.sphere(of: event)?.id : nil
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(store.sphereList + [store.bufferSphere].compactMap { $0 }) { sphere in
                    let selected = current == sphere.id
                    Button {
                        UISelectionFeedbackGenerator().selectionChanged()
                        Task { await store.setSphere(event, sphereId: sphere.id) }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: sphere.symbol).font(.caption)
                            Text(sphere.name).lineLimit(1)
                        }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .foregroundStyle(selected ? .white : .primary)
                        .background(selected ? sphere.tint : sphere.tint.opacity(0.15), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("sphere-\(sphere.name)")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
                if !store.activities.isEmpty {
                    Menu {
                        ForEach(store.activities.values.sorted { $0.name < $1.name }) { activity in
                            Button(activity.name) { Task { await store.setActivity(event, activityId: activity.id) } }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "square.stack").font(.caption)
                            Text(event.activityName ?? "Activity")
                        }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(event.activityId != nil ? Color.primary.opacity(0.15) : Color(.tertiarySystemFill), in: Capsule())
                    }
                    .tint(.primary)
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

private struct ActionButton: View {
    let title: String
    let symbol: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: symbol).font(.body.weight(.semibold))
                Text(title).font(.caption.weight(.medium))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .foregroundStyle(prominent ? Color(.systemBackground) : .primary)
            .background(prominent ? Color.primary : Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct Initials: View {
    let name: String

    var body: some View {
        let letters = name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
        Text(letters.isEmpty ? "?" : letters)
            .font(.caption.weight(.semibold))
            .frame(width: 30, height: 30)
            .background(Color(.tertiarySystemFill), in: Circle())
    }
}

/// An RRULE said in words, for the few shapes people actually make.
enum RecurrenceText {
    static func describe(_ rule: String) -> String {
        let body = rule.replacingOccurrences(of: "RRULE:", with: "")
        var parts: [String: String] = [:]
        for pair in body.split(separator: ";") {
            let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
            if kv.count == 2 { parts[kv[0]] = kv[1] }
        }
        let interval = Int(parts["INTERVAL"] ?? "1") ?? 1
        let names = ["MO": "Mon", "TU": "Tue", "WE": "Wed", "TH": "Thu", "FR": "Fri", "SA": "Sat", "SU": "Sun"]
        switch parts["FREQ"] {
        case "DAILY": return interval > 1 ? "Every \(interval) days" : "Every day"
        case "WEEKLY":
            let days = parts["BYDAY"]?.split(separator: ",").compactMap { names[String($0)] } ?? []
            if days == ["Mon", "Tue", "Wed", "Thu", "Fri"] { return "Every weekday" }
            let base = interval > 1 ? "Every \(interval) weeks" : "Weekly"
            return days.isEmpty ? base : "\(base) on \(days.joined(separator: ", "))"
        case "MONTHLY": return interval > 1 ? "Every \(interval) months" : "Monthly"
        case "YEARLY": return "Yearly"
        default: return "Repeats"
        }
    }
}
