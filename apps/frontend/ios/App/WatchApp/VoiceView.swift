import SwiftUI
import BalanceKit

/// Telling the calendar what to do out loud.
///
/// Everything else on this watch is a gesture on a ring, which is the right way to start a timer
/// and a hopeless way to say "move my run to six and make it an hour". Dictation is the only input
/// a wrist has that can carry a sentence, so this is one button, one sentence, and one line back.
///
/// Nothing about what the sentence means is worked out here. The words go to the server, which
/// hands them to the assistant's own tools — the same ones an MCP client gets — so the watch never
/// carries a second, quietly different idea of what "tomorrow morning" is. It is also why this is
/// the one screen that says plainly that it needs a connection: there is nothing sensible to queue.
struct VoiceView: View {
    /// Called when the assistant actually changed something, so the week behind this screen is
    /// refetched rather than left describing the calendar as it was a sentence ago.
    let onChange: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var state: Answer = .idle
    @State private var spoken: String?

    /// Named for what it holds rather than "state", which is the property wrapper's word here.
    private enum Answer: Equatable {
        case idle
        case thinking
        case answered(String)
        case failed(String)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let spoken {
                    Text("“\(spoken)”")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                switch state {
                case .idle:
                    Text("Say what to change.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                case .thinking:
                    ProgressView()
                case .answered(let reply):
                    Text(reply)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                case .failed(let message):
                    Text(message)
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .multilineTextAlignment(.center)
                }

                // The same button whatever has happened, because the answer to a reply that got it
                // wrong is another sentence — not a back-swipe and a fresh screen.
                TextFieldLink(prompt: Text("Say what to change")) {
                    Label(state == .idle ? "Speak" : "Say more", systemImage: "mic.fill")
                        .frame(maxWidth: .infinity)
                } onSubmit: { text in
                    Task { await send(text) }
                }
                .disabled(state == .thinking)
            }
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Ask")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func send(_ text: String) async {
        let said = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !said.isEmpty else { return }
        spoken = said
        state = .thinking
        do {
            let answer = try await APIClient.shared.sendVoiceCommand(text: said)
            state = .answered(answer.reply)
            if answer.changed { await onChange() }
        } catch {
            state = .failed(
                isOfflineFailure(error)
                    ? "No connection — this one needs the network."
                    : error.localizedDescription
            )
        }
    }
}
