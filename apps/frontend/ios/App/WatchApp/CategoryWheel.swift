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

    /// The handover between the week's ring and a session's, and everything that rides on it.
    static let collapse = Animation.easeInOut(duration: 0.3)

    /// How far the week's ring pushes past its own size on the way out. It leaves towards the
    /// viewer, the session's ring arrives from behind it, and the two cross in the middle.
    static let exitScale: CGFloat = 1.3
    static let enterScale: CGFloat = 0.82

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
    /// A category has been chosen and the session's own ring is arriving. This ring's whole job
    /// from here is to get out of the way of it.
    let leaving: Bool


    init(
        categories: [WatchCategory],
        focusedIndex: Int?,
        pan: CGSize = .zero,
        isPressing: Bool = false,
        leaving: Bool = false
    ) {
        self.categories = categories
        self.focusedIndex = focusedIndex
        self.pan = pan
        self.isPressing = isPressing
        self.leaving = leaving
    }

    init(model: WheelGestureModel, leaving: Bool = false) {
        self.init(
            categories: model.categories,
            focusedIndex: model.focusedIndex,
            pan: model.pan,
            isPressing: model.isPressing,
            leaving: leaving
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
                        isFocused: segment.index == focusedIndex && !leaving
                    )
                    .opacity(opacity(for: segment))
                }
                ForEach(layout.segments) { segment in
                    SegmentIcon(
                        segment: segment,
                        isFocused: segment.index == focusedIndex,
                        radius: radius - WheelMetrics.bandThickness / 2,
                        centre: CGPoint(x: proxy.size.width / 2, y: proxy.size.height / 2),
                        scale: scale
                    )
                    .opacity(opacity(for: segment))
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .scaleEffect(scale)
            .offset(leaving ? .zero : cameraOffset(radius: radius))
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
                .animation(WheelMetrics.collapse, value: leaving)
                .allowsHitTesting(false)
        }
        .aspectRatio(1, contentMode: .fit)
        // The week's ring does not turn into a session's ring — it gets out of the way of one. It
        // pushes out past its own size and fades, the session's ring comes up from behind it, and
        // whichever the eye is following is the one at full strength.
        .scaleEffect(leaving ? WheelMetrics.exitScale : 1)
        .opacity(leaving ? 0 : 1)
        .animation(WheelMetrics.collapse, value: leaving)
    }

    /// Everything about the ring that is worth animating, in one value, so a frame that changes
    /// several of them at once is still one animation.
    private var ringState: RingState {
        RingState(focused: focusedIndex, pan: pan, pressing: isPressing, leaving: leaving)
    }

    private struct RingState: Equatable {
        var focused: Int?
        var pan: CGSize
        var pressing: Bool
        var leaving: Bool
    }

    /// Which animation that change gets. Aiming — the close-up sliding under the finger — has to
    /// keep up with the hand, so it is the quick one. Everything that settles the ring into or out
    /// of a lap is the slow collapse, including cancelling back to the week.
    private var ringAnimation: Animation {
        guard !leaving, isPressing else { return WheelMetrics.collapse }
        return focusedIndex == nil
            ? .spring(response: 0.28, dampingFraction: 0.8)
            : .interactiveSpring(response: 0.18, dampingFraction: 0.9)
    }

    /// How big the ring is drawn: its own size at rest, a little up while a finger is down and
    /// undecided, and the close-up once the drag has picked a direction. A chosen category has no
    /// zoom at all — the ring is a clock face by then, and the whole of it has to be on screen.
    private var ringScale: CGFloat {
        // The close-up is held while the ring leaves. Letting it fall back to its resting size would
        // have the ring shrinking from 1.5 towards 1 at the same moment the exit is pushing it out
        // past 1 — the two cancel, and what should read as the week receding ends up barely moving.
        guard !leaving else { return WheelMetrics.focusScale }
        if focusedIndex != nil { return WheelMetrics.focusScale }
        return isPressing ? WheelMetrics.pressScale : 1
    }

    /// The hole in the middle of the ring, and the one thing it says at a time.
    @ViewBuilder
    private var centre: some View {
        if !leaving {
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
        guard let focusedIndex, !leaving else { return 1 }
        return segment.index == focusedIndex ? 1 : WheelMetrics.unfocusedOpacity
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
        Self.cameraOffset(layout: layout, focusedIndex: focusedIndex, pan: pan, radius: radius)
    }

    /// The same camera move, worked out from the drag rather than from a live view. The handover to
    /// a session's ring needs the offset the week's ring was sitting at in the frame the finger
    /// lifted, and by then the gesture has already been reset — so the maths has to be callable
    /// with the numbers kept aside, and there must only be one copy of it.
    static func cameraOffset(layout: WheelLayout, focusedIndex: Int?, pan: CGSize, radius: CGFloat) -> CGSize {
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

    private var color: Color { Color(hex: segment.category.color) }
    private var fill: Double { segment.category.dialFill }
    private var overflow: Double { segment.category.dialOverflow }

    var body: some View {
        let start = segment.startAngle
        let sweep = segment.sweep
        let inset = isFocused ? WheelMetrics.ringInset - 2 : WheelMetrics.ringInset
        let thickness = WheelMetrics.bandThickness + (isFocused ? 5 : 0)

        ZStack {
            Band(start: start, sweep: sweep, inset: inset, thickness: thickness)
                .fill(color.opacity(0.14))
            Band(start: start, sweep: sweep, inset: inset, thickness: thickness)
                .stroke(color.opacity(isFocused ? 0.95 : 0.55), lineWidth: 1.5)
            Band(
                start: start,
                sweep: sweep,
                inset: inset + thickness * (1 - fill),
                thickness: thickness * fill
            )
            .fill(color.opacity(isFocused ? 0.95 : 0.75))

            if overflow > 0 {
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
    /// The middle of the ring, in the space the glyph is placed in.
    let centre: CGPoint
    let scale: CGFloat

    var body: some View {
        let placement = segment.midAngle.radians - .pi / 2
        let size = (isFocused ? 15 : 12) / max(scale, 1) * 1.35

        Image(systemName: Icons.symbol(for: segment.category.icon))
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(Color.white.opacity(isFocused ? 1 : 0.85))
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
