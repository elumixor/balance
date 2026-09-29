import Foundation

/// Nights out of what Apple Health records — the phone's port of `integrations/sleep-*.ts`.
///
/// Health doesn't store a night; it stores samples, one per sleep stage from a watch, one "in bed"
/// span from a phone on the nightstand. The calendar wants the night, so the samples are merged:
/// anything asleep, from any source, joined wherever the gap is short enough to be the same night.
/// Awake samples are what happens inside a night, not its edges. "In bed" is used only when nothing
/// finer exists. The record this writes is read back by every platform, so its keys are a contract:
/// add to it, never rename.
public enum Sleep {
    public enum Stage: String, Codable, CaseIterable, Sendable {
        case inBed, awake, asleep, core, deep, rem
        var isAsleep: Bool { self == .asleep || self == .core || self == .deep || self == .rem }
    }

    public struct Sample: Equatable, Sendable {
        public let start: Date
        public let end: Date
        public let stage: Stage
        public init(start: Date, end: Date, stage: Stage) {
            self.start = start
            self.end = end
            self.stage = stage
        }
    }

    /// Two stretches of sleep this close together are one night with a gap in it.
    public static let maxGap: TimeInterval = 90 * 60
    /// Shorter than this is a sensor glitch, or a doze nobody would put on a calendar.
    public static let minSession: TimeInterval = 20 * 60
    /// How far either side of the block a night may lie and still be its night.
    public static let windowSlack: TimeInterval = 4 * 3600

    public static func sessions(_ samples: [Sample]) -> [(start: Date, end: Date)] {
        let asleep = samples.filter { $0.stage.isAsleep }
        let chosen = asleep.isEmpty ? samples.filter { $0.stage == .inBed } : asleep
        var sessions: [(start: Date, end: Date)] = []
        for sample in chosen.filter({ $0.end > $0.start }).sorted(by: { $0.start < $1.start }) {
            if let last = sessions.last, sample.start.timeIntervalSince(last.end) <= maxGap {
                if sample.end > last.end { sessions[sessions.count - 1].end = sample.end }
            } else {
                sessions.append((sample.start, sample.end))
            }
        }
        return sessions.filter { $0.end.timeIntervalSince($0.start) >= minSession }
    }

    /// One night, as the card under a "Sleep" block shows it.
    public struct Summary: Equatable, Sendable {
        public let start: Date
        public let end: Date
        public let asleepMinutes: Int
        public let stages: [Stage: Int]
        public let awakenings: Int
        public let staged: Bool
    }

    /// JavaScript's `Math.round`, which the records were first written with: halves go up.
    static func jsRound(_ value: Double) -> Int { Int((value + 0.5).rounded(.down)) }

    public static func summary(_ samples: [Sample], block: (start: Date, end: Date)) -> Summary? {
        let from = block.start.addingTimeInterval(-windowSlack)
        let to = block.end.addingTimeInterval(windowSlack)
        var best: (start: Date, end: Date)?
        var bestOverlap: TimeInterval = 0
        for session in sessions(samples) {
            let overlap = min(session.end, to).timeIntervalSince(max(session.start, from))
            if overlap > bestOverlap {
                best = session
                bestOverlap = overlap
            }
        }
        guard let best else { return nil }

        let inside = samples.filter { $0.end > best.start && $0.start < best.end }
        let staged = inside.contains { $0.stage == .core || $0.stage == .deep || $0.stage == .rem }
        var stages: [Stage: Int] = [:]
        var awakenings = 0
        for sample in inside {
            if sample.stage == .inBed, staged { continue }
            stages[sample.stage, default: 0] += jsRound(sample.end.timeIntervalSince(sample.start) / 60)
            if sample.stage == .awake { awakenings += 1 }
        }
        let asleep = staged
            ? [Stage.asleep, .core, .deep, .rem].reduce(0) { $0 + (stages[$1] ?? 0) }
            : jsRound(best.end.timeIntervalSince(best.start) / 60) - (stages[.awake] ?? 0)
        return Summary(start: best.start, end: best.end, asleepMinutes: asleep, stages: stages, awakenings: awakenings, staged: staged)
    }

    // MARK: Score

    public struct Score: Equatable, Sendable {
        public let total: Int
        public let duration: Int
        public let bedtime: Int
        public let interruptions: Int
        public var band: String { Sleep.band(total) }
    }

    static let fullNight = 7.0 * 60 + 50
    static let shortfallKnots: [(Double, Double)] = [(0, 0), (60, 5), (120, 13), (180, 35), (240, 50)]

    static func shortfall(_ asleep: Int) -> Double {
        let short = fullNight - Double(asleep)
        if short <= 0 { return 0 }
        for i in 1..<shortfallKnots.count {
            let (m0, p0) = shortfallKnots[i - 1]
            let (m1, p1) = shortfallKnots[i]
            if short <= m1 { return p0 + (short - m0) / (m1 - m0) * (p1 - p0) }
        }
        return 50
    }

    /// The night as the Health app grades it: how long, out of 50; to bed when meant, out of 30;
    /// how broken, out of 20 — Apple's published rules, measured against the planned block.
    public static func score(_ summary: Summary, plannedStart: Date) -> Score {
        func clamp(_ v: Double, _ hi: Double) -> Double { min(max(v, 0), hi) }
        var duration = 50 - shortfall(summary.asleepMinutes)
        if summary.staged, summary.asleepMinutes > 0 {
            let asleep = Double(summary.asleepMinutes)
            if Double(summary.stages[.deep] ?? 0) / asleep < 0.1 { duration -= 5 }
            if Double(summary.stages[.rem] ?? 0) / asleep < 0.15 { duration -= 5 }
        }
        duration = clamp(duration, 50)

        let offset = summary.start.timeIntervalSince(plannedStart) / 60
        var bedtime = 30.0
        if offset >= 15 {
            bedtime -= (offset - 15) / 4.5
        } else if -offset > 60 {
            bedtime -= min(6, ((-offset - 60) / 30).rounded(.down))
        }
        bedtime = clamp(bedtime, 30)

        let awake = Double(summary.stages[.awake] ?? 0)
        var interruptions = 20.0
        if awake > 11 { interruptions -= (awake - 11) / 4 }
        if summary.awakenings > 2 { interruptions -= Double(summary.awakenings - 2) / 2 }
        interruptions = clamp(interruptions, 20)

        let parts = (jsRound(duration), jsRound(bedtime), jsRound(interruptions))
        return Score(total: parts.0 + parts.1 + parts.2, duration: parts.0, bedtime: parts.1, interruptions: parts.2)
    }

    public static func band(_ total: Int) -> String {
        if total >= 96 { return "Very high" }
        if total >= 81 { return "High" }
        if total >= 61 { return "OK" }
        if total >= 41 { return "Low" }
        return "Very low"
    }

    // MARK: The stored record

    static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// The record for one occurrence, as `integration_records.data` holds it — the same keys the
    /// web build writes — with the block's planned time carried forward from the last one.
    public static func record(_ summary: Summary, block: (start: Date, end: Date), previous: [String: Any]?) -> [String: Any] {
        let planned: (String, String) = {
            if let s = previous?["plannedStart"] as? String, let e = previous?["plannedEnd"] as? String { return (s, e) }
            return (iso.string(from: block.start), iso.string(from: block.end))
        }()
        let plannedStart = iso.date(from: planned.0) ?? block.start
        let score = score(summary, plannedStart: plannedStart)
        var stages: [String: Int] = [:]
        for (stage, minutes) in summary.stages { stages[stage.rawValue] = minutes }
        return [
            "start": iso.string(from: summary.start),
            "end": iso.string(from: summary.end),
            "asleepMinutes": summary.asleepMinutes,
            "stages": stages,
            "awakenings": summary.awakenings,
            "staged": summary.staged,
            "plannedStart": planned.0,
            "plannedEnd": planned.1,
            "score": [
                "total": score.total, "duration": score.duration, "bedtime": score.bedtime,
                "interruptions": score.interruptions, "band": score.band,
            ],
        ]
    }
}
