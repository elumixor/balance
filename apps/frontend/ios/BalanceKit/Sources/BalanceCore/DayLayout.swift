import Foundation

/// Where each block of a day sits in its column.
///
/// Blocks that overlap share the column's width: a run of blocks that touch each other, directly
/// or through a third, is one cluster, each block takes the first lane free when it starts, and
/// every block in the cluster is as narrow as the cluster is deep. A block then widens to the
/// right over lanes nothing it overlaps is using, so one long meeting beside a short call is not
/// drawn at half width for its whole length.
public struct DayLayout: Sendable {
    public struct Item: Equatable, Sendable {
        public let id: String
        /// Minutes from the day's midnight, clipped to the day.
        public let startMinute: Double
        public let endMinute: Double
        public let lane: Int
        public let lanes: Int
        /// How many lanes it covers, from its own to the right.
        public let span: Int
    }

    public struct Input: Sendable {
        public let id: String
        public let start: Date
        public let end: Date
        public init(id: String, start: Date, end: Date) {
            self.id = id
            self.start = start
            self.end = end
        }
    }

    /// Short blocks are still drawn tall enough to be pressed.
    public static let minimumMinutes: Double = 15

    public static func layout(_ inputs: [Input], day: Date, calendar: Calendar = .current) -> [Item] {
        let dayStart = calendar.startOfDay(for: day)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart.addingTimeInterval(86400)
        let length = dayEnd.timeIntervalSince(dayStart) / 60

        struct Clip { let id: String; let start: Double; let end: Double }
        let clips = inputs.compactMap { input -> Clip? in
            guard input.end > dayStart, input.start < dayEnd else { return nil }
            let s = max(input.start, dayStart).timeIntervalSince(dayStart) / 60
            var e = min(input.end, dayEnd).timeIntervalSince(dayStart) / 60
            e = min(max(e, s + minimumMinutes), length)
            return Clip(id: input.id, start: min(s, length - minimumMinutes), end: e)
        }.sorted { ($0.start, -$0.end, $0.id) < ($1.start, -$1.end, $1.id) }

        var result: [Item] = []
        var cluster: [(clip: Clip, lane: Int)] = []
        var laneEnds: [Double] = []
        var clusterEnd = -Double.infinity

        func flush() {
            let lanes = laneEnds.count
            for (clip, lane) in cluster {
                var span = 1
                while lane + span < lanes {
                    let next = lane + span
                    let blocked = cluster.contains { other in
                        other.lane == next && other.clip.start < clip.end && clip.start < other.clip.end
                    }
                    if blocked { break }
                    span += 1
                }
                result.append(Item(id: clip.id, startMinute: clip.start, endMinute: clip.end, lane: lane, lanes: lanes, span: span))
            }
            cluster.removeAll()
            laneEnds.removeAll()
        }

        for clip in clips {
            if clip.start >= clusterEnd { flush() }
            if let lane = laneEnds.firstIndex(where: { $0 <= clip.start }) {
                laneEnds[lane] = clip.end
                cluster.append((clip, lane))
            } else {
                laneEnds.append(clip.end)
                cluster.append((clip, laneEnds.count - 1))
            }
            clusterEnd = max(clusterEnd, clip.end)
        }
        flush()
        return result
    }
}
