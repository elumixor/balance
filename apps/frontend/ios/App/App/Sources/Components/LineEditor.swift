import BalanceCore
import SwiftUI

/// A typed line with what goes with typing it: the words the bar above the keyboard offers for the
/// word under the caret, and — for a new line — what submitting it will make.
struct LineEditor: View {
    @Environment(Store.self) private var store
    @Binding var text: String
    @Binding var focused: Bool
    var placeholder: String
    /// Bumped by the owner when it sets `text` itself, as clearing it after a submit does.
    var revision = 0
    var showPreview = true
    /// Where a task goes when the line names no project.
    var defaultProject: Project?
    var onSubmit: (TypedLine) -> Void
    var onCancel: (() -> Void)?

    @State private var caret = 0
    @State private var picks = 0

    var line: TypedLine { LineReader.read(text, vocabulary: store.vocabulary) }

    var body: some View {
        let line = line
        VStack(alignment: .leading, spacing: 6) {
            if focused, !suggestions.isEmpty {
                SuggestionBar(items: suggestions, spheres: store.spheres) { accept($0) }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            TokenTextField(
                text: $text, caret: $caret, focused: $focused, placeholder: placeholder,
                revision: revision &* 10_000 &+ picks, tokens: line.tokens,
                tint: { token in tint(token) },
                onSubmit: { current in onSubmit(LineReader.read(current, vocabulary: store.vocabulary)) }, onEscape: onCancel
            )
            if showPreview, !text.trimmingCharacters(in: .whitespaces).isEmpty {
                LinePreview(line: line, defaultProject: defaultProject)
                    .transition(.opacity)
            }
        }
        .animation(.snappy(duration: 0.2), value: suggestions)
    }

    private func tint(_ token: TypedLine.Token) -> UIColor? {
        switch token.kind {
        case .sphere:
            if let ref = token.refId, let sphere = store.spheres[ref] { return UIColor(sphere.tint) }
            if let ref = token.refId, let activity = store.activities[ref],
               let first = activity.weights.max(by: { $0.weightPercent < $1.weightPercent }),
               let sphere = store.spheres[first.categoryId] { return UIColor(sphere.tint) }
            return nil
        case .project:
            if let ref = token.refId, let project = store.projects[ref], let sphere = store.spheres[project.categoryId] {
                return UIColor(sphere.tint)
            }
            return nil
        default:
            return nil
        }
    }

    private var suggestions: [Suggestion] {
        guard let word = Suggest.word(in: text, caret: caret) else { return [] }
        return Suggest.items(for: word.word, vocabulary: store.vocabulary)
    }

    private func accept(_ suggestion: Suggestion) {
        guard let word = Suggest.word(in: text, caret: caret) else { return }
        let ns = text as NSString
        let insert = suggestion.insert + " "
        text = ns.replacingCharacters(in: word.range, with: insert)
        caret = word.range.location + (insert as NSString).length
        picks += 1
        UISelectionFeedbackGenerator().selectionChanged()
    }
}

/// The row of words offered for the one being typed.
struct SuggestionBar: View {
    let items: [Suggestion]
    let spheres: [String: Sphere]
    let pick: (Suggestion) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items) { item in
                    Button { pick(item) } label: {
                        HStack(spacing: 5) {
                            icon(item)
                            Text(item.label).lineLimit(1)
                        }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color(.secondarySystemFill), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("suggestion-\(item.label)")
                }
            }
            .padding(.vertical, 2)
        }
        .scrollClipDisabled()
    }

    @ViewBuilder private func icon(_ item: Suggestion) -> some View {
        switch item.kind {
        case .sphere:
            Circle().fill(item.refId.flatMap { spheres[$0]?.tint } ?? .gray).frame(width: 8, height: 8)
        case .activity:
            Image(systemName: "square.stack").font(.caption)
        case .project:
            Image(systemName: "folder").font(.caption)
        case .date, .time, .duration:
            Image(systemName: "calendar").font(.caption)
        }
    }
}

/// What a line will make, said back before it is made.
struct LinePreview: View {
    @Environment(Store.self) private var store
    let line: TypedLine
    let defaultProject: Project?

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol).foregroundStyle(.secondary)
            Text(summary)
                .foregroundStyle(ok ? AnyShapeStyle(.secondary) : AnyShapeStyle(.red))
                .lineLimit(1)
            if let sphere = sphere {
                SpherePill(sphere: sphere)
            }
            if line.recurrence != nil {
                Image(systemName: "repeat").foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .font(.footnote)
        .accessibilityIdentifier("linePreview")
    }

    private var sphere: Sphere? {
        if let id = line.sphereId { return store.spheres[id] }
        if let id = line.activityId, let activity = store.activities[id],
           let top = activity.weights.max(by: { $0.weightPercent < $1.weightPercent }) {
            return store.spheres[top.categoryId]
        }
        if let id = line.projectId, let project = store.projects[id] { return store.spheres[project.categoryId] }
        return nil
    }

    private var ok: Bool {
        if line.title.isEmpty { return false }
        if case .task = line.intent { return line.projectId != nil || defaultProject != nil }
        return line.intent != nil
    }

    private var symbol: String {
        switch line.intent {
        case .event(_, _, true): return "sun.max"
        case .event: return "calendar"
        case .task: return "checkmark.circle"
        case nil: return "text.cursor"
        }
    }

    private var summary: String {
        if line.title.isEmpty { return "Name it too" }
        switch line.intent {
        case .event:
            return Format.when(line) ?? ""
        case .task(let day):
            let project = line.projectId.flatMap { store.projects[$0] } ?? defaultProject
            guard let project else { return "Add a time for an event, or @project for a to-do" }
            return ["To-do in \(project.name)", day.map { Format.day($0) }].compactMap { $0 }.joined(separator: " · ")
        case nil:
            return ""
        }
    }
}

struct SpherePill: View {
    let sphere: Sphere
    var compact = false

    var body: some View {
        HStack(spacing: 4) {
            Circle().fill(sphere.tint).frame(width: 7, height: 7)
            if !compact { Text(sphere.name).lineLimit(1) }
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(.secondary)
        .padding(.horizontal, compact ? 0 : 7)
        .padding(.vertical, 2)
        .background(compact ? Color.clear : sphere.tint.opacity(0.14), in: Capsule())
    }
}
