import BalanceKit
import SwiftUI

/// The sitting: the day behind thrown down like a hand of cards, the stars it earned, what it was
/// spent on — and one button for the day ahead, which opens the calendar on it.
///
/// It is built like a payout rather than a report: everything drawn from a number is a thing that
/// happened, and the words are written by the server under a rule that never names a miss.
struct SessionScreen: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    let slot: SessionSummary.Slot

    @State private var appeared = false

    var body: some View {
        NavigationStack {
            Group {
                if let summary = store.session, summary.slot == slot {
                    content(summary)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityIdentifier("closeSession")
                }
            }
        }
        .task { await store.loadSession(slot) }
    }

    private func content(_ summary: SessionSummary) -> some View {
        ScrollView {
            VStack(spacing: 0) {
                Text(reviewDate(summary))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)

                BlockFan(blocks: summary.review.top ?? [])
                    .frame(height: 150)
                    .padding(.vertical, 16)

                Text(summary.copy.title)
                    .font(.title2.weight(.semibold))
                    .multilineTextAlignment(.center)
                if !summary.copy.body.isEmpty {
                    Text(summary.copy.body)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 6)
                }

                HStack(spacing: 10) {
                    ForEach(0..<3, id: \.self) { index in
                        Image(systemName: index < summary.reviewStars ? "star.fill" : "star")
                            .font(.title)
                            .foregroundStyle(index < summary.reviewStars ? AnyShapeStyle(.yellow) : AnyShapeStyle(.quaternary))
                            .symbolEffect(.bounce, value: appeared)
                    }
                }
                .padding(.top, 24)
                Text(caption(summary))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.top, 6)

                RankPill(rank: summary.rank, streak: summary.streak)
                    .padding(.top, 14)

                if let categories = summary.review.categories, !categories.isEmpty {
                    section("Where the hours went") {
                        ForEach(categories.filter { $0.hours > 0 }) { category in
                            HoursRow(name: category.name, color: category.color, icon: category.icon, hours: category.hours, target: nil)
                        }
                    }
                }

                if !summary.review.blocks.isEmpty {
                    section("Done") {
                        ForEach(summary.review.blocks) { block in
                            HStack(spacing: 10) {
                                RoundedRectangle(cornerRadius: 2).fill(Color(hex: block.color ?? "#8A9097")).frame(width: 4, height: 28)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(block.title).lineLimit(1)
                                    Text(Format.range(block.start, block.end)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(Format.duration(minutes: Int(block.hours * 60))).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if !summary.copy.points.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(summary.copy.points.enumerated()), id: \.offset) { _, point in
                            Text(point.text).foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 28)
                }

                if let week = summary.week {
                    section("The week behind you") {
                        Text("\(hoursText(week.hours))h accounted for, and \(Int((week.match * 100).rounded()))% of the shape you drew.")
                            .frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(week.categories.filter { $0.hours > 0 }.prefix(6)) { category in
                            HoursRow(name: category.name, color: category.color, icon: category.icon, hours: category.hours, target: category.targetHours)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .safeAreaInset(edge: .bottom) { footer(summary) }
        .onAppear { appeared = true }
    }

    private func footer(_ summary: SessionSummary) -> some View {
        VStack(spacing: 8) {
            Button {
                store.planDay = summary.target.day
                store.lastAward = nil
                router.tab = .calendar
                router.calendarFocus = DayString.date(summary.target.day)
                dismiss()
            } label: {
                HStack(spacing: 8) {
                    Text(summary.target.planned ? "Look over \(summary.nextDayWord)" : "Plan \(summary.nextDayWord)")
                    if !summary.target.planned, summary.planStars > 0 {
                        Label("\(summary.planStars)", systemImage: "star.fill").labelStyle(.titleAndIcon).font(.subheadline.weight(.semibold))
                    }
                }
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.roundedRectangle(radius: 14))
            .accessibilityIdentifier("planButton")
            Button("Not now") { dismiss() }
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .background(.bar)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 28)
    }

    private func reviewDate(_ summary: SessionSummary) -> String {
        guard let date = DayString.date(summary.review.day) else { return "" }
        return date.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }

    private func caption(_ summary: SessionSummary) -> String {
        if summary.review.rest { return "A rest day, kept" }
        if summary.review.mappedHours > 0 { return "\(hoursText(summary.review.mappedHours))h given a meaning" }
        return "A day off the record"
    }
}

/// The day's biggest blocks, fanned like a hand of cards.
private struct BlockFan: View {
    let blocks: [SessionSummary.Block]

    var body: some View {
        let cards = Array(blocks.prefix(5))
        ZStack {
            ForEach(Array(cards.enumerated()), id: \.element.id) { index, block in
                let middle = Double(cards.count - 1) / 2
                let offset = Double(index) - middle
                VStack(alignment: .leading, spacing: 4) {
                    Image(systemName: Icons.symbol(for: block.icon)).font(.caption)
                    Spacer()
                    Text(block.title).font(.caption.weight(.semibold)).lineLimit(3)
                    Text(Format.duration(minutes: Int(block.hours * 60))).font(.caption2.monospacedDigit()).opacity(0.8)
                }
                .foregroundStyle(.white)
                .padding(10)
                .frame(width: 96, height: 128, alignment: .leading)
                .background(Color(hex: block.color ?? "#8A9097").gradient, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .shadow(color: .black.opacity(0.12), radius: 6, y: 3)
                .rotationEffect(.degrees(offset * 7), anchor: .bottom)
                .offset(x: offset * 46, y: abs(offset) * 6)
            }
            if cards.isEmpty {
                Image(systemName: "sun.horizon").font(.system(size: 48)).foregroundStyle(.tertiary)
            }
        }
    }
}

struct RankPill: View {
    let rank: SessionSummary.Rank
    var streak = 0

    var body: some View {
        HStack(spacing: 8) {
            Label("\(rank.stars)", systemImage: "star.fill")
                .font(.subheadline.weight(.semibold).monospacedDigit())
            HStack(spacing: 3) {
                ForEach(0..<5, id: \.self) { index in
                    Circle().fill(index <= rank.subtier ? Color.primary : Color(.systemFill)).frame(width: 6, height: 6)
                }
            }
            Text("\(rank.toNextSubtier) to go").font(.caption).foregroundStyle(.secondary)
            if streak > 1 {
                Text("· \(streak) days in a row").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color(.secondarySystemBackground), in: Capsule())
    }
}

private struct HoursRow: View {
    let name: String
    let color: String
    let icon: String
    let hours: Double
    let target: Double?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: Icons.symbol(for: icon)).foregroundStyle(Color(hex: color)).frame(width: 20)
            Text(name)
            Spacer()
            Text(target.map { "\(hoursText(hours)) of \(hoursText($0))h" } ?? "\(hoursText(hours))h")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
        }
    }
}
