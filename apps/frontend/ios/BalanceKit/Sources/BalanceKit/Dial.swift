import Foundation

/// Anything that can be drawn as one arc of the week: a plan, and how much of it has happened.
///
/// Both the watch's own ``WatchCategory`` and the snapshot's ``SnapshotCategory`` are this, which is
/// the point — the app's ring and the widget's dial are the same week at two sizes, and the maths
/// that turns hours into arcs is written once, here, rather than once per target.
public protocol DialCategory: Identifiable, Equatable where ID == String {
    var targetHours: Double { get }
    var actualHours: Double { get }
}

extension DialCategory {
    /// How far through the target the week is, where 1 means "exactly on target". A category with
    /// no target can't be behind or ahead of it, so it reads as zero rather than as infinity.
    public var ratio: Double {
        targetHours <= 0 ? 0 : actualHours / targetHours
    }

    /// How much of the arc is filled. Anything past the target is drawn separately, so the arc
    /// itself stops at full rather than wrapping around and lying about the week.
    public var dialFill: Double { min(max(ratio, 0), 1) }

    /// The overshoot as a fraction of the arc, capped at one extra lap so a wildly overspent
    /// category still reads as "over" instead of drawing over its neighbours.
    public var dialOverflow: Double { min(max(ratio - 1, 0), 1) }
}

/// One category's share of the circle. `start` and `span` are fractions of a full turn measured
/// clockwise from twelve o'clock, which both the app's angles and the widget's `trim` are a
/// multiplication away from.
public struct DialSegment<Category: DialCategory>: Identifiable, Equatable {
    public let index: Int
    public let category: Category
    public let start: Double
    public let span: Double

    public var id: String { category.id }
    public var end: Double { start + span }
    public var mid: Double { start + span / 2 }

    /// Whether a direction, given as a fraction of a turn from twelve o'clock, falls in this arc.
    public func contains(_ turn: Double) -> Bool {
        let offset = (turn - start).truncatingRemainder(dividingBy: 1)
        return (offset < 0 ? offset + 1 : offset) < span
    }
}

/// The week's categories laid around a circle.
///
/// Segments are sized by planned hours, so a ten-hour category takes twice the arc a five-hour one
/// does — that is what makes the ring readable as a week's plan rather than a menu. Categories with
/// no target would collapse to nothing, which leaves them invisible on the widget and impossible to
/// drag onto in the app, so every segment is given a floor of a few percent of the circle before
/// the shares are normalised again.
public struct DialLayout<Category: DialCategory>: Equatable {
    /// The floor, as a fraction of the circle. Small enough that it barely disturbs a real plan,
    /// large enough that a segment given it can still be aimed at with a fingertip.
    public static var minimumShare: Double { 0.05 }

    public let segments: [DialSegment<Category>]

    public init(categories: [Category], minimumShare: Double = DialLayout.minimumShare) {
        guard !categories.isEmpty else {
            segments = []
            return
        }

        let planned = categories.map { max($0.targetHours, 0) }
        let total = planned.reduce(0, +)
        // With nothing planned at all there are no shares to take a fraction of, so the categories
        // simply divide the circle evenly.
        let floor = total > 0 ? total * minimumShare : 1
        let weights = planned.map { max($0, floor) }
        let weightTotal = weights.reduce(0, +)

        var cursor = 0.0
        var built: [DialSegment<Category>] = []
        built.reserveCapacity(categories.count)
        for (index, category) in categories.enumerated() {
            let span = weights[index] / weightTotal
            built.append(DialSegment(index: index, category: category, start: cursor, span: span))
            cursor += span
        }
        segments = built
    }

    public var isEmpty: Bool { segments.isEmpty }

    public func segment(at index: Int) -> DialSegment<Category>? {
        segments.indices.contains(index) ? segments[index] : nil
    }

    /// The segment covering a direction, given as a fraction of a turn from twelve o'clock. The
    /// last segment catches a direction that floating point drift pushed past the end of the circle.
    public func index(at turn: Double) -> Int? {
        guard !segments.isEmpty else { return nil }
        return segments.first(where: { $0.contains(turn) })?.index ?? segments.count - 1
    }
}
