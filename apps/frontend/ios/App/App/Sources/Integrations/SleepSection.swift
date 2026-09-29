import BalanceKit
import SwiftUI

/// The night Health recorded under a sleep block: how long, when, how deep, and the score.
struct SleepSection: View {
    let record: [String: Any]

    private var asleep: Int { record["asleepMinutes"] as? Int ?? 0 }
    private var start: Date? { (record["start"] as? String).flatMap(ISO8601.date(from:)) }
    private var end: Date? { (record["end"] as? String).flatMap(ISO8601.date(from:)) }
    private var stages: [String: Int] { record["stages"] as? [String: Int] ?? [:] }
    private var score: [String: Any]? { record["score"] as? [String: Any] }

    private static let order: [(String, String, Color)] = [
        ("deep", "Deep", .indigo), ("core", "Core", .blue), ("rem", "REM", .cyan), ("asleep", "Asleep", .blue),
        ("awake", "Awake", .orange), ("inBed", "In bed", .gray),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(Format.duration(minutes: asleep))
                        .font(.title2.weight(.semibold).monospacedDigit())
                    if let start, let end {
                        Text(Format.range(start, end)).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if let total = score?["total"] as? Int {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(total)").font(.title2.weight(.semibold).monospacedDigit())
                        Text(score?["band"] as? String ?? "").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            let parts = Self.order.compactMap { key, label, color in stages[key].map { (label, color, $0) } }.filter { $0.2 > 0 }
            let total = max(parts.reduce(0) { $0 + $1.2 }, 1)
            GeometryReader { geo in
                HStack(spacing: 2) {
                    ForEach(parts, id: \.0) { _, color, minutes in
                        color.frame(width: max(2, geo.size.width * CGFloat(minutes) / CGFloat(total) - 2))
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: 8)
            HStack(spacing: 12) {
                ForEach(parts, id: \.0) { label, color, minutes in
                    HStack(spacing: 4) {
                        Circle().fill(color).frame(width: 7, height: 7)
                        Text("\(label) \(Format.duration(minutes: minutes))").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}
