import SwiftUI
import BalanceKit

/// Where the ring's angles start and how thick it is drawn. The wheel and the gesture that selects
/// on it have to agree about geometry, so the numbers live in one place instead of being repeated
/// in the shapes.
enum WheelMetrics {
    /// Every angle in the wheel is measured clockwise from twelve o'clock, which is where the
    /// drag's direction is measured from too, so the maths reads the same way the screen looks.
    static let ringInset: CGFloat = 3
    static let bandThickness: CGFloat = 18

    /// A constant wedge taken out of both ends of a segment so neighbours read as separate bands.
    static let gap = Angle.degrees(3)

    /// The camera move. The ring never turns — dragging pushes it under the screen the way a hand
    /// pushes a map, and crossing the dead zone snaps to the close-up so the segment being dragged
    /// towards fills the middle instead of sitting on the rim.
    static let focusScale: CGFloat = 1.5

    /// How much further than the dead zone the finger travels before the ring has slid the whole
    /// way, putting the focused band under the middle of the screen.
    static let panTravel: CGFloat = 45

    /// How much of the camera is decided by the focused segment rather than by the finger — of both
    /// the direction it looks in and how far out it goes. Nearly all of it: the close-up parks on
    /// the band and stays there, so crossing into a segment is a move to it rather than a slide that
    /// keeps drifting. What is left is enough to see the ring answer the drag.
    static let segmentSnap = 0.88

    /// How far a focused segment's centre is pushed from the middle of the screen, as a fraction of
    /// the ring's own radius. Less than one keeps the close-up from parking the band right against
    /// the edge.
    static let focusDistance: CGFloat = 0.7

    /// What the segments that were not picked fall back to while one of them is focused.
    static let unfocusedOpacity = 0.35

    /// Below this a segment is too narrow for a legible glyph, so it goes without one unless it is
    /// the focused segment, which is always drawn large enough.
    static let iconMinimumSweep = Angle.degrees(26)

    /// What the ring becomes once a category is chosen: one thinner lap of the clock face, which the
    /// duration dial then reads its minutes off. The week's segments collapse into it rather than
    /// being replaced by it, so the choice and what is being set with it are visibly the same ring.
    static let dialThickness: CGFloat = 11

    /// The collapse, and everything that rides on it.
    static let collapse = Animation.spring(response: 0.42, dampingFraction: 0.85)
}

/// The ring is a ``DialLayout`` — shares of the circle worked out from planned hours, the same way
/// the widget's dial works them out, so the two never draw the same week differently. All this half
/// of the app adds is angles: the layout speaks in fractions of a turn, and the shapes want radians.
typealias WheelSegment = DialSegment<WatchCategory>
typealias WheelLayout = DialLayout<WatchCategory>

extension DialSegment {
    var startAngle: Angle { .radians(start * 2 * .pi) }
    var sweep: Angle { .radians(span * 2 * .pi) }
    var midAngle: Angle { .radians(mid * 2 * .pi) }
}

extension DialLayout {
    /// The segment covering a direction, measured clockwise from twelve o'clock.
    func index(at angle: Angle) -> Int? {
        index(at: angle.normalizedTurn.radians / (2 * .pi))
    }
}

/// The ring of categories that appears under a press: each segment is as wide as the category's
/// share of the planned week and as full as the hours already spent on it.
///
/// The ring is fixed in place — a category always sits in the same direction, so it can be reached
/// by muscle memory. What the drag moves is the camera: past the dead zone the view snaps to a
/// close-up and the ring slides against the finger, bringing whatever is being dragged towards into
/// the middle of the screen.
///
/// This view knows nothing about touches. It is handed a focused index and the drag it came from,
/// and renders the state; the gesture that produces both lives in `WheelGestureModel`.
struct CategoryWheel: View {
    let categories: [WatchCategory]
    let focusedIndex: Int?
    /// The finger's travel since the press began, in screen coordinates.
    let pan: CGSize
    /// The category that has been chosen, once the finger has lifted. The ring gives the whole
    /// circle to it and takes it away from everything else, ending up as the clock face the
    /// duration is dialled on.
    let chosenIndex: Int?

    init(categories: [WatchCategory], focusedIndex: Int?, pan: CGSize = .zero, chosenIndex: Int? = nil) {
        self.categories = categories
        self.focusedIndex = focusedIndex
        self.pan = pan
        self.chosenIndex = chosenIndex
    }

    init(model: WheelGestureModel, chosenIndex: Int? = nil) {
        self.init(
            categories: model.categories,
            focusedIndex: model.focusedIndex,
            pan: model.pan,
            chosenIndex: chosenIndex
        )
    }

    private var layout: WheelLayout { WheelLayout(categories: categories) }

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let radius = size / 2 - WheelMetrics.ringInset
            let scale: CGFloat = focusedIndex == nil || chosenIndex != nil ? 1 : WheelMetrics.focusScale

            ZStack {
                ForEach(layout.segments) { segment in
                    SegmentBand(
                        segment: segment,
                        isFocused: segment.index == focusedIndex && chosenIndex == nil,
                        collapse: collapse(for: segment)
                    )
                    .opacity(opacity(for: segment))
                }
                ForEach(layout.segments) { segment in
                    SegmentIcon(
                        segment: segment,
                        isFocused: segment.index == focusedIndex,
                        radius: radius - WheelMetrics.bandThickness / 2,
                        scale: scale
                    )
                    // The glyphs belong to picking a category. Once one is picked the ring is a
                    // clock face, and its own ticks say what it means.
                    .opacity(chosenIndex == nil ? opacity(for: segment) : 0)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .scaleEffect(scale)
            .offset(chosenIndex == nil ? cameraOffset(radius: radius) : .zero)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: focusedIndex)
            .animation(.interactiveSpring(response: 0.18, dampingFraction: 0.9), value: pan)
            .animation(WheelMetrics.collapse, value: chosenIndex)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    /// The ring is fully drawn whenever nothing is focused — it is the screen's one piece of
    /// content, and dimming it at rest would only make the week harder to read. A focused segment
    /// keeps that weight while the rest step back, so the drag has something to have picked out.
    private func opacity(for segment: WheelSegment) -> Double {
        guard let focusedIndex, chosenIndex == nil else { return 1 }
        return segment.index == focusedIndex ? 1 : WheelMetrics.unfocusedOpacity
    }

    /// Where a segment is heading once a category has been chosen: the chosen one to a full lap
    /// starting at twelve o'clock, everything else to nothing where it already stands.
    private func collapse(for segment: WheelSegment) -> (start: Angle, sweep: Angle)? {
        guard let chosenIndex else { return nil }
        guard segment.index == chosenIndex else { return (segment.midAngle, .zero) }
        return (.zero, .degrees(360))
    }

    /// The ring moves opposite the finger, by as much as it takes to put the band the finger points
    /// at under the middle of the screen — reached gradually over `panTravel`, so the close-up can
    /// be nudged around rather than jumping to its far side the moment the dead zone is crossed.
    ///
    /// The direction is pulled part of the way towards the middle of the focused segment rather than
    /// following the finger exactly. A fingertip is wider than the gap between two bands, and a
    /// camera that tracked the finger to the last degree would sit on a seam as readily as on a
    /// band; leaning towards the middle means whatever is focused is also what is centred, while the
    /// remaining freedom still makes the ring feel dragged rather than switched.
    private func cameraOffset(radius: CGFloat) -> CGSize {
        guard let focusedIndex, let segment = layout.segment(at: focusedIndex) else { return .zero }
        let travel = hypot(pan.width, pan.height)
        guard travel > 0 else { return .zero }

        let aim = Angle.radians(atan2(Double(pan.width), Double(-pan.height)))
            .leaning(towards: segment.midAngle, by: WheelMetrics.segmentSnap)

        // How far out is snapped the same way the direction is: crossing the dead zone puts the band
        // under the middle of the screen at once, and reaching further only creeps the last of the
        // way. Otherwise a segment could be focused while still being drawn half off the edge, which
        // is the same "aimed at one thing, looking at another" the angle snap exists to prevent.
        let bandCentre = (radius - WheelMetrics.bandThickness / 2) * WheelMetrics.focusScale * WheelMetrics.focusDistance
        let progress = min(max((travel - WheelGestureModel.deadZone) / WheelMetrics.panTravel, 0), 1)
        let reached = bandCentre * progress
        let distance = reached + (bandCentre - reached) * WheelMetrics.segmentSnap

        // Angles are measured clockwise from twelve o'clock; screen coordinates run downward.
        return CGSize(
            width: -sin(aim.radians) * distance,
            height: cos(aim.radians) * distance
        )
    }
}

/// A single category's band: the outline is the plan, and the week so far fills it from the middle
/// of the ring outward — the band deepens rather than creeping around its own arc, so the segments
/// can be compared by how far each has risen toward the rim.
private struct SegmentBand: View {
    let segment: WheelSegment
    let isFocused: Bool
    /// Where this segment is going once a category has been chosen, if one has been.
    let collapse: (start: Angle, sweep: Angle)?

    private var color: Color { Color(hex: segment.category.color) }
    private var fill: Double { segment.category.dialFill }
    private var overflow: Double { segment.category.dialOverflow }

    var body: some View {
        let start = collapse?.start ?? segment.startAngle
        let sweep = collapse?.sweep ?? segment.sweep
        let inset = isFocused ? WheelMetrics.ringInset - 2 : WheelMetrics.ringInset
        let thickness = collapse != nil
            ? WheelMetrics.dialThickness
            : WheelMetrics.bandThickness + (isFocused ? 5 : 0)
        // The week so far is what the ring says while a category is being picked. Once one is, the
        // ring is a clock face and the fill would only be another arc to misread as minutes.
        let weekFill = collapse == nil ? fill : 0

        ZStack {
            Band(start: start, sweep: sweep, inset: inset, thickness: thickness)
                .fill(color.opacity(0.12))
            Band(start: start, sweep: sweep, inset: inset, thickness: thickness)
                .stroke(color.opacity(isFocused ? 0.95 : 0.55), lineWidth: 1.5)
            Band(
                start: start,
                sweep: sweep,
                inset: inset + thickness * (1 - weekFill),
                thickness: thickness * weekFill
            )
            .fill(color.opacity(isFocused ? 0.95 : 0.7))

            if overflow > 0, collapse == nil {
                Band(
                    start: start,
                    sweep: Angle.radians(sweep.radians * overflow),
                    inset: inset + thickness + 2,
                    thickness: 2.5
                )
                .fill(color)
            }
        }
    }
}

/// The category's glyph, sitting on the middle of its band. It is drawn against the close-up's
/// magnification so the glyph keeps roughly the size it had before the camera moved in — the point
/// of the zoom is a bigger band to aim at, not a bigger icon.
private struct SegmentIcon: View {
    let segment: WheelSegment
    let isFocused: Bool
    let radius: CGFloat
    let scale: CGFloat

    var body: some View {
        let visible = isFocused || segment.sweep.radians >= WheelMetrics.iconMinimumSweep.radians
        let placement = segment.midAngle.radians - .pi / 2
        let size = (isFocused ? 15 : 12) / max(scale, 1) * 1.35

        Image(systemName: Icons.symbol(for: segment.category.icon))
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(isFocused ? Color.black : Color.white.opacity(0.85))
            .offset(x: radius * cos(placement), y: radius * sin(placement))
            .opacity(visible ? 1 : 0)
    }
}

/// An annular wedge: out along the outer edge, back along the inner one. Angles come in measured
/// clockwise from twelve o'clock, which is a quarter turn off the coordinate system's zero.
///
/// Every number it is drawn from is animatable, which is what lets the week's segments collapse into
/// the single lap the duration dial is set on: the same shapes travel from their share of the circle
/// to nothing (or, for the chosen one, to the whole of it) instead of being swapped for other views.
struct Band: Shape {
    var start: Angle
    var sweep: Angle
    var inset: CGFloat
    var thickness: CGFloat
    /// Whether a sliver is trimmed off both ends to keep this band apart from a neighbour. A lap
    /// with no neighbour — the duration dial's arc, a running session's elapsed ring — turns this
    /// off, since a full sweep trimmed by a gap on both ends is a circle with a seam in it rather
    /// than the unbroken one it is meant to be.
    var gapped: Bool = true

    var animatableData: AnimatablePair<AnimatablePair<Double, Double>, AnimatablePair<CGFloat, CGFloat>> {
        get { .init(.init(start.radians, sweep.radians), .init(inset, thickness)) }
        set {
            start = .radians(newValue.first.first)
            sweep = .radians(newValue.first.second)
            inset = newValue.second.first
            thickness = newValue.second.second
        }
    }

    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) / 2 - inset
        let inner = max(outer - thickness, 0)

        // The gap keeps neighbouring bands apart, but a sliver of a segment must not be eaten
        // entirely by it, so it never takes more than two thirds of the sweep.
        let gap = gapped ? min(WheelMetrics.gap.radians, sweep.radians * 0.66) : 0
        let from = Angle.radians(start.radians + gap / 2 - .pi / 2)
        let to = Angle.radians(start.radians + sweep.radians - gap / 2 - .pi / 2)

        guard to.radians > from.radians, outer > 0 else { return Path() }

        var path = Path()
        path.addArc(center: center, radius: outer, startAngle: from, endAngle: to, clockwise: false)
        path.addArc(center: center, radius: inner, startAngle: to, endAngle: from, clockwise: true)
        path.closeSubpath()
        return path
    }
}

extension Angle {
    /// The same direction expressed inside a single turn, so angles that differ by whole
    /// revolutions compare equal.
    var normalizedTurn: Angle {
        let turn = 2 * Double.pi
        return .radians(radians.truncatingRemainder(dividingBy: turn) + (radians < 0 ? turn : 0))
    }

    /// This direction moved a fraction of the way towards another one, the short way round.
    func leaning(towards other: Angle, by amount: Double) -> Angle {
        let turn = 2 * Double.pi
        var delta = (other.radians - radians).truncatingRemainder(dividingBy: turn)
        if delta > .pi { delta -= turn }
        if delta < -.pi { delta += turn }
        return .radians(radians + delta * amount)
    }
}
