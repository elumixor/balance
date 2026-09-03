import BalanceKit
import SwiftUI

/// The question a finished timer leaves behind: was it the thing that was already on the calendar?
///
/// One candidate is offered, the likeliest, with a yes and a no — a wrist is not the place for a
/// list. "No" is the quiet answer: the timer's own event is already in the week, and nothing more
/// has to happen. When the server was fairly unsure the others are one tap further down, so a
/// gym session that ran beside a call can still find its block.
struct MatchPromptView: View {
    let prompt: MatchPrompt
    let answer: (MatchCandidate?) -> Void

    @State private var showingOthers = false

    private var others: [MatchCandidate] { Array(prompt.candidates.dropFirst()) }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("Was this")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text(prompt.best.title.isEmpty ? "Untitled" : prompt.best.title)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                Text(span(prompt.best))
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Button { answer(prompt.best) } label: {
                    Label("Yes, that one", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .tint(Color(hex: prompt.session.categoryColor))
                .buttonStyle(.borderedProminent)

                Button { answer(nil) } label: {
                    Label("No, keep it separate", systemImage: "xmark")
                        .frame(maxWidth: .infinity)
                }

                if !others.isEmpty {
                    if showingOthers {
                        ForEach(others) { candidate in
                            Button { answer(candidate) } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(candidate.title.isEmpty ? "Untitled" : candidate.title).lineLimit(2)
                                    Text(span(candidate)).font(.caption2).foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    } else {
                        Button("Something else…") { showingOthers = true }
                            .buttonStyle(.plain)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .interactiveDismissDisabled()
    }

    private func span(_ candidate: MatchCandidate) -> String {
        let from = candidate.start.formatted(date: .omitted, time: .shortened)
        let to = candidate.end.formatted(date: .omitted, time: .shortened)
        return "\(from) – \(to)"
    }
}
