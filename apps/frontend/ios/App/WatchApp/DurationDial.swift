import SwiftUI
import BalanceKit

/// How long a session should run. `free` has no planned end and no alarm — it is ended by hand.
enum TrackingDuration: Equatable {
    case fixed(minutes: Int)
    case free

    var minutes: Int? {
        switch self {
        case .fixed(let minutes): return minutes
        case .free: return nil
        }
    }
}

/// How a running session is broken up by reminders. A tick is a nudge and nothing more — it has
/// nothing to act on, it only says how far through you are — so it is described either as a rhythm
/// ("every ten minutes") or as a count of equal parts, whichever the session is easier to think
/// about. An open-ended session can only have a rhythm: it has no length to divide.
enum TickPlan: Equatable {
    case off
    case every(minutes: Int)
    case parts(Int)
}

/// Everything the dial decides: how long, and how often to be nudged while it runs.
struct TrackingPlan: Equatable {
    /// Zero means an open-ended session — the dial reads it as "Free".
    var minutes: Int
    var ticks: TickPlan

    var duration: TrackingDuration { minutes > 0 ? .fixed(minutes: minutes) : .free }

    /// How far into the session each nudge falls. The end of a fixed session is announced by the
    /// session's own alarm, so the last boundary is never also a tick.
    var tickOffsets: [TimeInterval] {
        guard minutes > 0 else { return [] }
        let step: Double
        switch ticks {
        case .off: return []
        case .every(let every): step = Double(every)
        case .parts(let parts): step = Double(minutes) / Double(max(parts, 1))
        }
        guard step > 0 else { return [] }

        var offsets: [TimeInterval] = []
        var at = step
        while at < Double(minutes) - 0.01 {
            offsets.append(at * 60)
            at += step
        }
        return offsets
    }

    /// The rhythm an open-ended session ticks to, which repeats because there is no end to stop at.
    var repeatingTickInterval: TimeInterval? {
        guard minutes == 0, case .every(let every) = ticks, every > 0 else { return nil }
        return TimeInterval(every * 60)
    }
}

/// What the crown is currently pointed at. The ticks button walks through these, so the same crown
/// sets the length, then the rhythm, without a second control appearing on a screen this size.
enum DialMode: Equatable {
    case duration
    case tickEvery
    case tickParts
}

/// The lengths the crown stops at. Not a constant step, because a constant step can only be right
/// for one end of the range: five minutes is far too coarse to set a short session with and far too
/// fine to reach four hours through. So the ladder is dense where sessions actually are — every
/// minute up to ten, then every five to the hour — and opens out past that.
enum DurationLadder {
    static let steps: [Int] = {
        var values = [0]
        values += Array(1...10)
        values += stride(from: 15, through: 60, by: 5)
        values += stride(from: 75, through: 240, by: 15)
        return values
    }()

    static var topRung: Double { Double(steps.count - 1) }

    /// The length a rung of the ladder means. The crown hands back fractions while it is being
    /// turned, so this rounds rather than trusting the index.
    static func minutes(atRung rung: Double) -> Int {
        let index = Int(rung.rounded())
        return steps[min(max(index, 0), steps.count - 1)]
    }

    /// Which rung a length sits on, for anything that has to set the dial rather than read it.
    static func rung(forMinutes minutes: Int) -> Double {
        Double(steps.firstIndex(where: { $0 >= minutes }) ?? steps.count - 1)
    }
}

/// The dial's state, held outside the view because the ticks button lives in the navigation bar and
/// the crown lives in the middle of the screen, and both are setting the same thing.
@MainActor
@Observable
final class TrackingPlanner {
    let category: WatchCategory
    let index: Int

    /// Which rung of ``DurationLadder`` the crown is parked on. Half an hour is where the dial opens
    /// because that is what most sessions turn out to be.
    var rung: Double = DurationLadder.rung(forMinutes: 30)
    var mode: DialMode = .duration

    /// The length that rung means, with zero meaning open-ended.
    var minutes: Double { Double(DurationLadder.minutes(atRung: rung)) }

    /// Kept across mode changes so switching the ticks off and on again doesn't forget the rhythm.
    var tickEvery: Double = 10
    var tickParts: Double = 3

    init(category: WatchCategory, index: Int) {
        self.category = category
        self.index = index
    }

    var isFree: Bool { minutes < 1 }

    var ticks: TickPlan {
        switch mode {
        case .duration: return .off
        case .tickEvery: return .every(minutes: Int(tickEvery.rounded()))
        case .tickParts: return isFree ? .off : .parts(Int(tickParts.rounded()))
        }
    }

    var plan: TrackingPlan {
        TrackingPlan(minutes: isFree ? 0 : Int(minutes.rounded()), ticks: ticks)
    }

    /// The ticks button: off, then a rhythm, then a number of parts, then off again. An open-ended
    /// session skips the parts — there is nothing to split.
    func cycleTicks() {
        switch mode {
        case .duration: mode = .tickEvery
        case .tickEvery: mode = isFree ? .duration : .tickParts
        case .tickParts: mode = .duration
        }
    }

    var tickGlyph: String {
        switch mode {
        case .duration: return "bell.slash"
        case .tickEvery: return "bell.badge"
        case .tickParts: return "chart.pie"
        }
    }

    /// The tick rhythm can't be longer than the session it divides, and a session dialled shorter
    /// than the rhythm it was given has to pull the rhythm down with it. As fine as a minute, so a
    /// short session can still be nudged more than once.
    var tickEveryRange: ClosedRange<Double> {
        let top = isFree ? 60.0 : max(1, (minutes / 2).rounded(.down))
        return 1...max(top, 1)
    }
}

/// The clock face shared by the duration dial and a running session: one lap of arc per hour, so a
/// length reads as stacked layers rather than as a line that has quietly wrapped around, with a
/// scale of marks tucked just inside the band and — while a rhythm is being set or shown — marks
/// crossing the band itself, the way the system's own sleep dial marks time directly on its arc.
///
/// This is the whole of the session's ring — its track, its arc, the scale the arc is read against
/// and the marks a rhythm puts across it. The week's ring is a separate view and a separate thing:
/// it steps out of the way as this one arrives rather than trying to become it.
struct RingFace: View {
    let color: Color
    /// The length being drawn, in minutes — dialled while setting up, elapsed while running.
    let minutes: Double
    /// An open-ended length draws no laps and no scale; there is nothing yet to measure against.
    let isFree: Bool
    /// Where nudges fall, as fractions of a lap.
    let tickTurns: [Double]
    /// How the arc travels when the length changes. Quick by default, because that is the crown
    /// being turned; the dial hands it something slower for the one sweep it opens with.
    var sweep: Animation = .easeOut(duration: 0.16)

    static let lap = 60.0

    /// How far in from the ring's outer edge each part of the face sits. The scale hangs just inside
    /// the band, and the hours a long session stacks up hang inside the scale, so nothing has to
    /// move aside to make room for anything else.
    static let bandInner = WheelMetrics.ringInset + WheelMetrics.dialThickness
    static let scaleDepth: CGFloat = 6
    static let hollow = bandInner + 3 + scaleDepth + 5
    /// How much of the width the lines under the number may have. They sit close to the middle of
    /// the hole, where the circle is at its widest, so they can reach further out than the ring's
    /// own thickness would suggest.
    static let labelInset = bandInner + 4

    private static let tickStep = 5.0
    private static let majorTickStep = 15.0

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let bandMid = size / 2 - WheelMetrics.ringInset - WheelMetrics.dialThickness / 2

            ZStack {
                Band(
                    start: .zero,
                    sweep: .degrees(360),
                    inset: WheelMetrics.ringInset,
                    thickness: WheelMetrics.dialThickness,
                    gap: .zero
                )
                .fill(color.opacity(0.18))

                if !isFree {
                    marks(outer: size / 2 - Self.bandInner - 3)
                }
                arcs
                if !tickTurns.isEmpty {
                    tickMarks(radius: bandMid)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .animation(sweep, value: minutes)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    /// Five minutes to a hairline, a quarter of an hour to a real mark. Faint on purpose: it is a
    /// scale to read the arc against, not a second ring competing with it.
    private func marks(outer: CGFloat) -> some View {
        ZStack {
            ForEach(Array(stride(from: 0.0, to: Self.lap, by: Self.tickStep)), id: \.self) { minute in
                let major = minute.truncatingRemainder(dividingBy: Self.majorTickStep) == 0
                Capsule()
                    .fill(Color.white.opacity(major ? 0.4 : 0.14))
                    .frame(width: major ? 1.5 : 1, height: major ? Self.scaleDepth : 3)
                    .offset(y: -(outer - (major ? Self.scaleDepth : 3) / 2))
                    .rotationEffect(.degrees(minute / Self.lap * 360))
            }
        }
    }

    /// The length itself. The first hour is the ring; every hour after it is another lap drawn
    /// inside the scale, thinner and darker, so a long length reads as layers rather than as an arc
    /// that has quietly wrapped around and started lying. Never gapped — a lap has no neighbour to
    /// be kept apart from, and a full lap must read as one unbroken circle.
    private var arcs: some View {
        ForEach(laps, id: \.index) { lap in
            Band(start: .zero, sweep: .degrees(lap.turn * 360), inset: lap.inset, thickness: lap.thickness, gap: .zero)
                .fill(color.opacity(lap.opacity))
        }
    }

    /// The rhythm, drawn straight across the band rather than as a dot floating outside it.
    private func tickMarks(radius: CGFloat) -> some View {
        ForEach(tickTurns, id: \.self) { turn in
            Capsule()
                .fill(Color.black.opacity(0.7))
                .frame(width: 2, height: WheelMetrics.dialThickness + 2)
                .offset(y: -radius)
                .rotationEffect(.degrees(turn * 360))
        }
    }

    /// One entry per hour the length runs for. The first is the ring itself; the rest are thinner,
    /// darker laps stacked inside the scale, each obviously a layer above the last rather than more
    /// of the same arc.
    private var laps: [(index: Int, turn: Double, inset: CGFloat, thickness: CGFloat, opacity: Double)] {
        guard !isFree else { return [] }
        let minutes = self.minutes.rounded()
        let full = Int(minutes / Self.lap)
        let remainder = minutes.truncatingRemainder(dividingBy: Self.lap) / Self.lap

        return (0...full).compactMap { index in
            let turn = index < full ? 1 : remainder
            guard turn > 0 else { return nil }
            guard index > 0 else {
                return (0, turn, WheelMetrics.ringInset, WheelMetrics.dialThickness, 0.95)
            }
            let inset = Self.bandInner + 3 + Self.scaleDepth + CGFloat(index - 1) * 6
            return (index, turn, inset, 3.5, max(0.7 - Double(index - 1) * 0.15, 0.3))
        }
    }
}

/// What sits in the hole in the middle of the ring, for both the dial and a running session: the
/// number the ring is showing, the category under it, and one quiet line of detail under that.
///
struct DialReadout: View {
    let tint: Color
    let categoryName: String
    let categoryIcon: String
    /// The big number in the middle — minutes being dialled, or the clock of a running session.
    let value: String
    let note: String?
    let noteColor: Color

    var body: some View {
        VStack(spacing: 1) {
            Text(value)
                .font(.system(size: 24, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                // The number sits dead centre, where the hole is at its narrowest between the laps
                // a long session stacks up; the lines under it are lower down, where it is wider.
                .padding(.horizontal, RingFace.hollow - RingFace.labelInset)

            HStack(spacing: 4) {
                Image(systemName: Icons.symbol(for: categoryIcon))
                    .font(.system(size: 11, weight: .semibold))
                Text(categoryName)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(tint)

            if let note {
                Text(note)
                    .font(.system(size: 10))
                    .foregroundStyle(noteColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        // Everything here has to live inside the hole in the middle of the ring. The lines sit
        // near its middle, where it is widest, so they are given more of it than the number above
        // them, which has the stacked laps of a long session to clear.
        .padding(.vertical, RingFace.hollow)
        .padding(.horizontal, RingFace.labelInset)
    }
}

/// The screen a category collapses into: the ring it was picked off becomes a clock face, one lap of
/// it an hour, and the crown sets how much of it this session gets. The length and the category sit
/// in the hole at its middle; the button that starts it lives in the screen's bottom margin, out of
/// the ring's way.
struct DurationDialView: View {
    @Bindable var planner: TrackingPlanner

    @FocusState private var crownFocused: Bool

    private var color: Color { Color(hex: planner.category.color) }

    var body: some View {
        RingFace(color: color, minutes: planner.minutes, isFree: planner.isFree, tickTurns: tickTurns)
            .overlay {
                DialReadout(
                    tint: color,
                    categoryName: planner.category.name,
                    categoryIcon: planner.category.icon,
                    value: lengthText,
                    note: ticksText,
                    noteColor: color
                )
            }
            .modifier(CrownControl(planner: planner, focused: $crownFocused))
            .onAppear { crownFocused = true }
    }

    private var tickTurns: [Double] {
        planner.plan.tickOffsets.map { $0 / 60 / RingFace.lap }
    }

    private var lengthText: String {
        // An open-ended length has no number to show — the infinity sign says the same thing a
        // clock face can't: there is nothing here to count down.
        guard !planner.isFree else { return "∞" }
        let minutes = Int(planner.minutes.rounded())
        guard minutes >= 60 else { return "\(minutes)m" }
        let rest = minutes % 60
        return rest == 0 ? "\(minutes / 60)h" : "\(minutes / 60)h \(rest)"
    }

    private var ticksText: String? {
        switch planner.ticks {
        case .off: return nil
        case .every(let every): return "every \(every) min"
        case .parts(let parts): return "split in \(parts)"
        }
    }
}

/// The crown, pointed at whichever value the mode names. It is a modifier rather than a call on the
/// view because each mode needs its own range and step, and the only way to change those is to hand
/// SwiftUI a fresh view for them.
///
/// The crown only turns a view that was already focusable when it was handed the binding, so
/// `focusable()` is applied underneath `digitalCrownRotation` in every branch rather than once
/// around the outside — the other way round leaves the dial focusable and deaf.
private struct CrownControl: ViewModifier {
    @Bindable var planner: TrackingPlanner
    @FocusState.Binding var focused: Bool

    func body(content: Content) -> some View {
        Group {
            switch planner.mode {
            case .duration:
                // The crown counts rungs, not minutes: the ladder decides what each one is worth,
                // so a single detent is a minute down at the short end and a quarter of an hour up
                // at the long one, without the crown having to be turned any differently.
                focusable(content).digitalCrownRotation(
                    $planner.rung, from: 0, through: DurationLadder.topRung, by: 1,
                    sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
                )
            case .tickEvery:
                focusable(content).digitalCrownRotation(
                    $planner.tickEvery,
                    from: planner.tickEveryRange.lowerBound,
                    through: planner.tickEveryRange.upperBound,
                    by: 1,
                    sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true
                )
            case .tickParts:
                focusable(content).digitalCrownRotation(
                    $planner.tickParts, from: 2, through: 12, by: 1,
                    sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true
                )
            }
        }
        .id(planner.mode)
        // The `id` above rebuilds the view for every mode, and a rebuilt view has lost its focus —
        // so the crown is claimed on each appearance, not only when the mode changes.
        .onAppear { focused = true }
        .onChange(of: planner.mode) { _, _ in focused = true }
        // A session dialled shorter than its own rhythm would tick once at the very end, which is
        // the alarm's job, so the rhythm follows the length down.
        .onChange(of: planner.rung) { _, _ in
            planner.tickEvery = min(planner.tickEvery, planner.tickEveryRange.upperBound)
        }
    }

    private func focusable(_ content: Content) -> some View {
        content.focusable().focused($focused)
    }
}
