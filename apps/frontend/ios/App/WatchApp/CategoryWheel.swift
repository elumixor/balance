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

    /// What the ring does the instant a finger lands, before it has been dragged anywhere: it comes
    /// up a little, so the press is answered before the choice is. Small on purpose — this is the
    /// ring acknowledging the touch, not the close-up, which is what crossing the dead zone buys.
    static let pressScale: CGFloat = 1.15

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

    /// What the ring becomes once a category is chosen: one thinner lap of the clock face, which the
    /// duration dial then reads its minutes off. The week's segments collapse into it rather than
    /// being replaced by it, so the choice and what is being set with it are visibly the same ring.
    static let dialThickness: CGFloat = 11

    /// The collapse, and everything that rides on it. Slow on purpose: it is the one moment the
    /// screen explains itself, showing the week's arcs closing into the single lap a session is
    /// dialled on, and at a glanceable speed there is nothing to read.
    static let collapse = Animation.spring(response: 1.26, dampingFraction: 0.85)

    /// The id a category's glyph travels under, from its band on the ring to the label under the
    /// clock. One per category, so the glyph that leaves the ring and the glyph that appears in the
    /// label are the same view moving rather than two views crossfading.
    static func glyphID(_ categoryID: String) -> String { "category-glyph-\(categoryID)" }
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
    /// A finger is down on the ring. The centre's start glyph is only an invitation to press, so it
    /// steps out of the way for as long as one already has.
    let isPressing: Bool
    /// The category that has been chosen, once the finger has lifted. The ring gives the whole
    /// circle to it and takes it away from everything else, ending up as the clock face the
    /// duration is dialled on.
    let chosenIndex: Int?
    /// The space the chosen glyph flies through on its way to the label under the clock.
    let glyphs: Namespace.ID

    /// Whether the chosen sector has finished filling itself into a whole lap. Until it has, the lap
    /// is the brightest thing on screen, because it is the thing moving; after, it dims to the track
    /// the dial's minutes are drawn on.
    @State private var lapSettled = false

    init(
        categories: [WatchCategory],
        focusedIndex: Int?,
        pan: CGSize = .zero,
        isPressing: Bool = false,
        chosenIndex: Int? = nil,
        glyphs: Namespace.ID
    ) {
        self.categories = categories
        self.focusedIndex = focusedIndex
        self.pan = pan
        self.isPressing = isPressing
        self.chosenIndex = chosenIndex
        self.glyphs = glyphs
    }

    init(model: WheelGestureModel, chosenIndex: Int? = nil, glyphs: Namespace.ID) {
        self.init(
            categories: model.categories,
            focusedIndex: model.focusedIndex,
            pan: model.pan,
            isPressing: model.isPressing,
            chosenIndex: chosenIndex,
            glyphs: glyphs
        )
    }

    private var layout: WheelLayout { WheelLayout(categories: categories) }

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let radius = size / 2 - WheelMetrics.ringInset
            let scale = ringScale

            ZStack {
                ForEach(layout.segments) { segment in
                    SegmentBand(
                        segment: segment,
                        isFocused: segment.index == focusedIndex && chosenIndex == nil,
                        collapse: collapse(for: segment),
                        settled: lapSettled
                    )
                    .opacity(opacity(for: segment))
                }
                ForEach(layout.segments) { segment in
                    // The glyphs belong to picking a category. Once one is picked the ring is a
                    // clock face and its own marks say what it means, so the rest fade where they
                    // stand — and the chosen one leaves the ring entirely, to reappear as the label
                    // under the clock it flies into.
                    if segment.index != chosenIndex {
                        SegmentIcon(
                            segment: segment,
                            isFocused: segment.index == focusedIndex,
                            radius: radius - WheelMetrics.bandThickness / 2,
                            centre: CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2),
                            scale: scale,
                            glyphs: glyphs
                        )
                        .opacity(chosenIndex == nil ? opacity(for: segment) : 0)
                        // The glyphs that were not picked have nothing to say about the lap being
                        // opened, so they go before it, rather than hanging over the whole of a
                        // collapse that is deliberately slow.
                        .animation(.easeOut(duration: 0.25), value: chosenIndex)
                    }
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .scaleEffect(scale)
            .offset(chosenIndex == nil ? cameraOffset(radius: radius) : .zero)
            // One animation for the whole ring rather than one per value: the collapse changes the
            // focus, the pan and the choice in a single frame, and chained `animation(_:value:)`
            // modifiers would leave the fastest of them deciding how the slowest one looks.
            .animation(ringAnimation, value: ringState)

            // What the middle says, which is one of three things: an invitation to press before a
            // finger has landed, what to do with the press once one has, and nothing at all from the
            // moment the drag picks a segment — the readout on the finger says it better from there.
            centre
                .frame(width: proxy.size.width, height: proxy.size.height)
                .animation(.easeOut(duration: 0.15), value: isPressing)
                .animation(.easeOut(duration: 0.15), value: focusedIndex == nil)
                .animation(WheelMetrics.collapse, value: chosenIndex)
                .allowsHitTesting(false)
        }
        .aspectRatio(1, contentMode: .fit)
        .task(id: chosenIndex) {
            lapSettled = false
            guard chosenIndex != nil else { return }
            try? await Task.sleep(for: .seconds(0.55))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.8)) { lapSettled = true }
        }
    }

    /// Everything about the ring that is worth animating, in one value, so a frame that changes
    /// several of them at once is still one animation.
    private var ringState: RingState {
        RingState(focused: focusedIndex, pan: pan, pressing: isPressing, chosen: chosenIndex)
    }

    private struct RingState: Equatable {
        var focused: Int?
        var pan: CGSize
        var pressing: Bool
        var chosen: Int?
    }

    /// Which animation that change gets. Aiming — the close-up sliding under the finger — has to
    /// keep up with the hand, so it is the quick one. Everything that settles the ring into or out
    /// of a lap is the slow collapse, including cancelling back to the week.
    private var ringAnimation: Animation {
        guard chosenIndex == nil else { return WheelMetrics.collapse }
        guard isPressing else { return WheelMetrics.collapse }
        return focusedIndex == nil
            ? .spring(response: 0.28, dampingFraction: 0.8)
            : .interactiveSpring(response: 0.18, dampingFraction: 0.9)
    }

    /// How big the ring is drawn: its own size at rest, a little up while a finger is down and
    /// undecided, and the close-up once the drag has picked a direction. A chosen category has no
    /// zoom at all — the ring is a clock face by then, and the whole of it has to be on screen.
    private var ringScale: CGFloat {
        guard chosenIndex == nil else { return 1 }
        if focusedIndex != nil { return WheelMetrics.focusScale }
        return isPressing ? WheelMetrics.pressScale : 1
    }

    /// The hole in the middle of the ring, and the one thing it says at a time.
    @ViewBuilder
    private var centre: some View {
        if chosenIndex == nil {
            if !isPressing {
                Image(systemName: "play.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
            } else if focusedIndex == nil {
                Text("Drag to a category")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 92)
                    .transition(.opacity)
            }
        }
    }

    /// The ring is fully drawn whenever nothing is focused — it is the screen's one piece of
    /// content, and dimming it at rest would only make the week harder to read. A focused segment
    /// keeps that weight while the rest step back, so the drag has something to have picked out.
    private func opacity(for segment: WheelSegment) -> Double {
        guard let focusedIndex, chosenIndex == nil else { return 1 }
        return segment.index == focusedIndex ? 1 : WheelMetrics.unfocusedOpacity
    }

    /// Where a segment is heading once a category has been chosen.
    ///
    /// What moves is the seams between the segments, not the segments themselves. Every boundary
    /// before the chosen one is pushed back to twelve o'clock and every boundary after it is pushed
    /// forward to twelve o'clock the other way round, which leaves the chosen segment holding the
    /// whole turn and the rest squeezed out to nothing at the seam. Because each segment's start and
    /// sweep are both linear in those boundaries, interpolating them is interpolating the boundaries:
    /// the ring is a complete, non-overlapping partition of the circle in every frame of the
    /// collapse, rather than one arc growing through five others that are shrinking into themselves.
    private func collapse(for segment: WheelSegment) -> (start: Angle, sweep: Angle, chosen: Bool)? {
        guard let chosenIndex else { return nil }
        let opens: Double = segment.index <= chosenIndex ? 0 : 1
        let closes: Double = segment.index < chosenIndex ? 0 : 1
        return (
            .radians(opens * 2 * .pi),
            .radians((closes - opens) * 2 * .pi),
            segment.index == chosenIndex
        )
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
///
/// Nothing here fades while the ring collapses. A segment that was not chosen leaves by being
/// squeezed to no width at all, and the one that was leaves by filling: its week rises to the brim
/// and its outline and its background both come up to meet the fill, until outline, background and
/// week are one colour and the band is simply a solid lap. That lap is the dial's track, and only
/// once it is whole does it dim — as one uniform ring, which reads as a light going down rather than
/// as parts of the ring dissolving at different rates.
private struct SegmentBand: View {
    let segment: WheelSegment
    let isFocused: Bool
    /// Where this segment is going once a category has been chosen, if one has been — and whether
    /// it is the one that was chosen, since the two travel in opposite directions.
    let collapse: (start: Angle, sweep: Angle, chosen: Bool)?
    /// The lap has finished opening and is now the track the dial draws minutes on.
    let settled: Bool

    /// What the chosen sector reads at while it fills, and what the finished lap reads at once it is
    /// only a track — bright enough to be the thing moving, then quiet enough to be drawn over.
    private static let brimmed = 0.8
    private static let track = 0.2

    private var color: Color { Color(hex: segment.category.color) }
    private var fill: Double { segment.category.dialFill }
    private var overflow: Double { segment.category.dialOverflow }
    private var chosen: Bool { collapse?.chosen == true }

    var body: some View {
        let start = collapse?.start ?? segment.startAngle
        let sweep = collapse?.sweep ?? segment.sweep
        let inset = isFocused ? WheelMetrics.ringInset - 2 : WheelMetrics.ringInset
        let thickness = collapse != nil
            ? WheelMetrics.dialThickness
            : WheelMetrics.bandThickness + (isFocused ? 5 : 0)
        // How much of the band is filled: the week so far, or the whole of it for the sector that
        // was chosen, which is what makes it stop being a reading of the week and start being a lap.
        let solid = chosen ? 1 : fill
        let gap: Angle = collapse == nil ? WheelMetrics.gap : .zero
        let level = chosen ? (settled ? Self.track : Self.brimmed) : (isFocused ? 0.95 : 0.7)
        // Background and outline are the fill's own colour for the chosen sector, so there is
        // nothing left to tell them apart from it by the time the lap is closed.
        let backing = chosen ? level : 0.14
        let outline = chosen ? level : (isFocused ? 0.95 : 0.55)

        ZStack {
            Band(start: start, sweep: sweep, inset: inset, thickness: thickness, gap: gap)
                .fill(color.opacity(backing))
            Band(start: start, sweep: sweep, inset: inset, thickness: thickness, gap: gap)
                .stroke(color.opacity(outline), lineWidth: 1.5)
            Band(
                start: start,
                sweep: sweep,
                inset: inset + thickness * (1 - solid),
                thickness: thickness * solid,
                gap: gap
            )
            .fill(color.opacity(level))

            // Going over the plan is a thing to know about a week, and the lap being opened is not a
            // week any more — so it goes at once rather than being swept round the whole circle.
            if overflow > 0 {
                Band(
                    start: start,
                    sweep: Angle.radians(sweep.radians * overflow),
                    inset: inset + thickness + 2,
                    thickness: 2.5,
                    gap: gap
                )
                .fill(color)
                .opacity(chosen ? 0 : 1)
                .animation(.easeOut(duration: 0.2), value: chosen)
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
    /// The middle of the ring, in the space the glyph is placed in.
    let centre: CGPoint
    let scale: CGFloat
    let glyphs: Namespace.ID

    var body: some View {
        let placement = segment.midAngle.radians - .pi / 2
        let size = (isFocused ? 15 : 12) / max(scale, 1) * 1.35

        Image(systemName: Icons.symbol(for: segment.category.icon))
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(Color.white.opacity(isFocused ? 1 : 0.85))
            // Recorded before the glyph is placed, but `position` is a layout modifier rather than a
            // drawing one, so what the flight reads is the glyph's real place on the band. An
            // `offset` here would leave every glyph reporting the middle of the ring, and a flight
            // from the middle of the ring to a label just under it is a crossfade with extra steps.
            .matchedGeometryEffect(id: WheelMetrics.glyphID(segment.category.id), in: glyphs)
            .position(x: centre.x + radius * cos(placement), y: centre.y + radius * sin(placement))
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
    /// The sliver trimmed off both ends to keep this band apart from its neighbours. A lap with no
    /// neighbour — the duration dial's arc, a running session's elapsed ring — asks for none, since
    /// a full sweep trimmed at both ends is a circle with a seam in it rather than the unbroken one
    /// it is meant to be. It animates like everything else here, so a ring closing up into one lap
    /// loses its seams over the same move rather than on its first frame.
    var gap: Angle = WheelMetrics.gap

    var animatableData: AnimatablePair<AnimatablePair<Double, Double>, AnimatablePair<AnimatablePair<CGFloat, CGFloat>, Double>> {
        get { .init(.init(start.radians, sweep.radians), .init(.init(inset, thickness), gap.radians)) }
        set {
            start = .radians(newValue.first.first)
            sweep = .radians(newValue.first.second)
            inset = newValue.second.first.first
            thickness = newValue.second.first.second
            gap = .radians(newValue.second.second)
        }
    }

    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) / 2 - inset
        let inner = max(outer - thickness, 0)

        // The gap keeps neighbouring bands apart, but a sliver of a segment must not be eaten
        // entirely by it, so it never takes more than two thirds of the sweep.
        let gap = min(max(self.gap.radians, 0), sweep.radians * 0.66)
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
