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
    static let focusScale: CGFloat = 2

    /// How much further than the dead zone the finger travels before the ring has slid the whole
    /// way, putting the focused band under the middle of the screen.
    static let panTravel: CGFloat = 45

    /// Below this a segment is too narrow for a legible glyph, so it goes without one unless it is
    /// the focused segment, which is always drawn large enough.
    static let iconMinimumSweep = Angle.degrees(26)
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

    init(categories: [WatchCategory], focusedIndex: Int?, pan: CGSize = .zero) {
        self.categories = categories
        self.focusedIndex = focusedIndex
        self.pan = pan
    }

    init(model: WheelGestureModel) {
        self.init(categories: model.categories, focusedIndex: model.focusedIndex, pan: model.pan)
    }

    private var layout: WheelLayout { WheelLayout(categories: categories) }

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let radius = size / 2 - WheelMetrics.ringInset
            let scale: CGFloat = focusedIndex == nil ? 1 : WheelMetrics.focusScale

            ZStack {
                ForEach(layout.segments) { segment in
                    SegmentBand(segment: segment, isFocused: segment.index == focusedIndex)
                }
                ForEach(layout.segments) { segment in
                    SegmentIcon(
                        segment: segment,
                        isFocused: segment.index == focusedIndex,
                        radius: radius - WheelMetrics.bandThickness / 2,
                        scale: scale
                    )
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .scaleEffect(scale)
            .offset(cameraOffset(radius: radius))
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: focusedIndex)
            .animation(.interactiveSpring(response: 0.18, dampingFraction: 0.9), value: pan)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    /// The ring moves opposite the finger, by as much as it takes to put the band the finger points
    /// at under the middle of the screen — reached gradually over `panTravel`, so the close-up can
    /// be nudged around rather than jumping to its far side the moment the dead zone is crossed.
    private func cameraOffset(radius: CGFloat) -> CGSize {
        guard focusedIndex != nil else { return .zero }
        let travel = hypot(pan.width, pan.height)
        guard travel > 0 else { return .zero }

        let bandCentre = (radius - WheelMetrics.bandThickness / 2) * WheelMetrics.focusScale
        let progress = min(max((travel - WheelGestureModel.deadZone) / WheelMetrics.panTravel, 0), 1)
        let distance = bandCentre * progress
        return CGSize(width: -pan.width / travel * distance, height: -pan.height / travel * distance)
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
        let inset = isFocused ? WheelMetrics.ringInset - 2 : WheelMetrics.ringInset
        let thickness = WheelMetrics.bandThickness + (isFocused ? 5 : 0)

        ZStack {
            Band(start: segment.startAngle, sweep: segment.sweep, inset: inset, thickness: thickness)
                .fill(color.opacity(0.12))
            Band(start: segment.startAngle, sweep: segment.sweep, inset: inset, thickness: thickness)
                .stroke(color.opacity(isFocused ? 0.95 : 0.55), lineWidth: 1.5)
            Band(
                start: segment.startAngle,
                sweep: segment.sweep,
                inset: inset + thickness * (1 - fill),
                thickness: thickness * fill
            )
            .fill(color.opacity(isFocused ? 0.95 : 0.7))

            if overflow > 0 {
                Band(
                    start: segment.startAngle,
                    sweep: Angle.radians(segment.sweep.radians * overflow),
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
private struct Band: Shape {
    let start: Angle
    let sweep: Angle
    let inset: CGFloat
    let thickness: CGFloat

    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) / 2 - inset
        let inner = max(outer - thickness, 0)

        // The gap keeps neighbouring bands apart, but a sliver of a segment must not be eaten
        // entirely by it, so it never takes more than two thirds of the sweep.
        let gap = min(WheelMetrics.gap.radians, sweep.radians * 0.66)
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
}
