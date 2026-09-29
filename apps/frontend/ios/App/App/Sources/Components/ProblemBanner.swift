import SwiftUI

/// The one place a failure is said: a card per problem under the status bar, a sentence written
/// for a person, and what actually broke one tap away for whoever has to fix it.
struct ProblemBanner: View {
    @Environment(Store.self) private var store
    @State private var expanded: UUID?

    var body: some View {
        VStack(spacing: 8) {
            ForEach(store.problems) { problem in
                card(problem)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: problem.id) {
                        try? await Task.sleep(for: .seconds(6))
                        if expanded != problem.id { withAnimation(.smooth) { store.dismiss(problem) } }
                    }
            }
        }
        .padding(.horizontal, 12)
        .animation(.smooth, value: store.problems)
    }

    private func card(_ problem: Store.Problem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(problem.title).font(.subheadline.weight(.semibold))
                if expanded == problem.id {
                    Text(problem.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }
            Spacer(minLength: 0)
            Button {
                withAnimation(.smooth) { store.dismiss(problem) }
            } label: {
                Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(.secondary)
            }
            .accessibilityLabel("Dismiss")
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        .onTapGesture { withAnimation(.smooth) { expanded = expanded == problem.id ? nil : problem.id } }
        .gesture(DragGesture(minimumDistance: 10).onEnded { if $0.translation.height < -10 { store.dismiss(problem) } })
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("problem")
    }
}
