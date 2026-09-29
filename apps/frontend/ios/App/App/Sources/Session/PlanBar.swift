import SwiftUI

/// The strip under the calendar while a day is being planned: how full the day is against the
/// bar, and the button that writes it down. The meter answers every drag at once because it is
/// worked out here from the blocks on screen; the server checks it again on commit.
struct PlanBar: View {
    @Environment(Store.self) private var store
    let day: String

    @State private var committing = false
    @State private var confirmRest = false

    private var budget: Double {
        guard let target = store.session?.target, target.day == day, target.budgetHours > 0 else { return 16 }
        return target.budgetHours
    }
    private var threshold: Double { store.session?.coverageThreshold ?? 0.7 }
    private var mapped: Double { store.mappedHours(on: day) }
    private var coverage: Double { min(1, mapped / budget) }
    private var ready: Bool { coverage >= threshold }
    private var stars: Int {
        guard let session = store.session, session.target.day == day else { return 0 }
        return session.planStars
    }
    private var dayLabel: String { DayString.date(day).map { Format.day($0) } ?? day }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let award = store.lastAward {
                celebration(award)
            } else {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Planning \(dayLabel)").font(.subheadline.weight(.semibold))
                        Text(ready ? "Ready to commit" : "\(Format.duration(minutes: Int(((budget * threshold) - mapped) * 60))) more to give a meaning")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .contentTransition(.numericText())
                    }
                    Spacer()
                    Button { store.planDay = nil } label: {
                        Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Stop planning")
                }
                meter
                HStack {
                    Button("Rest day") { confirmRest = true }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        Task {
                            committing = true
                            if await store.commitPlan() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
                            committing = false
                        }
                    } label: {
                        HStack(spacing: 6) {
                            if committing { ProgressView().controlSize(.small) }
                            Text("Commit")
                            if stars > 0 { Label("\(stars)", systemImage: "star.fill").labelStyle(.titleAndIcon) }
                        }
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!ready || committing)
                    .accessibilityIdentifier("commitPlan")
                }
            }
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
        .animation(.snappy, value: coverage)
        .confirmationDialog("Keep \(dayLabel) as a rest day?", isPresented: $confirmRest, titleVisibility: .visible) {
            Button("Rest day") { Task { await store.commitPlan(rest: true) } }
        } message: {
            Text("It keeps your streak and earns the day's star.")
        }
    }

    private var meter: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(.systemFill))
                Capsule().fill(ready ? Color.green : Color.primary).frame(width: geo.size.width * coverage)
                Rectangle().fill(Color.secondary).frame(width: 2, height: 12).offset(x: geo.size.width * threshold - 1)
            }
        }
        .frame(height: 8)
        .accessibilityLabel("\(Int(coverage * 100)) percent planned")
    }

    private func celebration(_ award: CommitResult) -> some View {
        let earned = award.awarded.reduce(0) { $0 + $1.delta }
        return HStack(spacing: 12) {
            Image(systemName: "star.fill").font(.title2).foregroundStyle(.yellow).symbolEffect(.bounce, value: earned)
            VStack(alignment: .leading, spacing: 2) {
                Text(award.alreadyPlanned ? "\(dayLabel) was already planned" : "\(dayLabel) is planned")
                    .font(.subheadline.weight(.semibold))
                Text(earned > 0 ? "+\(earned) · \(award.stars) stars" : "\(award.stars) stars").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Done") {
                store.lastAward = nil
                store.planDay = nil
            }
            .buttonStyle(.bordered)
        }
        .task {
            try? await Task.sleep(for: .seconds(4))
            if store.lastAward != nil {
                withAnimation(.smooth) {
                    store.lastAward = nil
                    store.planDay = nil
                }
            }
        }
    }
}
