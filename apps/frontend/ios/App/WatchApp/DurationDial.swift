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

/// The dial's state, held outside the view because the ticks button lives in the navigation bar and
/// the crown lives in the middle of the screen, and both are setting the same thing.
@MainActor
@Observable
final class TrackingPlanner {
    let category: WatchCategory
    let index: Int

    /// Minutes, in five-minute steps, with zero meaning open-ended. Half an hour is where the dial
    /// opens because that is what most sessions turn out to be.
    var minutes: Double = 30
    var mode: DialMode = .duration

    /// Kept across mode changes so switching the ticks off and on again doesn't forget the rhythm.
    var tickEvery: Double = 10
    var tickParts: Double = 3

    init(category: WatchCategory, index: Int) {
        self.category = category
        self.index = index
    }

    var isFree: Bool { minutes < 2.5 }

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
        let top = isFree ? 60.0 : max(1, (minutes - 5).rounded())
        return 1...max(top, 1)
    }
}

/// The clock face shared by the duration dial and a running session: rim marks for scale, one lap
/// of arc per hour so a length reads as stacked layers rather than a line that has quietly wrapped
/// around, and — while a rhythm is being set or shown — marks crossing the band itself rather than
/// floating outside it, the way the system's own sleep dial marks time directly on its arc.
struct RingFace: View {
    let color: Color
    /// The length being drawn, in minutes — dialled while setting up, elapsed while running.
    let minutes: Double
    /// An open-ended length draws no laps at all; there is nothing yet to measure it against.
    let isFree: Bool
    /// Where nudges fall, as fractions of a lap.
    let tickTurns: [Double]

    static let lap = 60.0
    private static let tickStep = 5.0
    private static let majorTickStep = 15.0

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            // The marks give way to the laps a long session stacks under the ring, so the two never
            // have to share a radius.
            let lapDepth = CGFloat(max(laps.count - 1, 0)) * 7
            let outer = size / 2 - WheelMetrics.ringInset - WheelMetrics.dialThickness - 3 - lapDepth
            let bandMid = size / 2 - WheelMetrics.ringInset - WheelMetrics.dialThickness / 2

            ZStack {
                marks(outer: outer)
                arcs
                if !tickTurns.isEmpty {
                    tickMarks(radius: bandMid)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .animation(.easeOut(duration: 0.16), value: minutes)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    /// Five minutes to a mark, a quarter of an hour to a long one.
    private func marks(outer: CGFloat) -> some View {
        ZStack {
            ForEach(Array(stride(from: 0.0, to: Self.lap, by: Self.tickStep)), id: \.self) { minute in
                let major = minute.truncatingRemainder(dividingBy: Self.majorTickStep) == 0
                Capsule()
                    .fill(Color.white.opacity(major ? 0.5 : 0.25))
                    .frame(width: major ? 2 : 1.5, height: major ? 7 : 4)
                    .offset(y: -(outer - (major ? 3.5 : 2)))
                    .rotationEffect(.degrees(minute / Self.lap * 360))
            }
        }
    }

    /// The length itself. The first hour is the ring; every hour after it is another lap drawn
    /// inside the one before, thinner and darker, so a long length reads as layers rather than as
    /// an arc that has quietly wrapped around and started lying. Never gapped — a lap has no
    /// neighbour to be kept apart from, and a full lap must read as one unbroken circle.
    private var arcs: some View {
        ForEach(laps, id: \.index) { lap in
            Band(start: .zero, sweep: .degrees(lap.turn * 360), inset: lap.inset, thickness: lap.thickness, gapped: false)
                .fill(color.opacity(lap.opacity))
        }
    }

    /// The rhythm, drawn straight across the band rather than as a dot floating outside it.
    private func tickMarks(radius: CGFloat) -> some View {
        ForEach(tickTurns, id: \.self) { turn in
            Capsule()
                .fill(Color.black.opacity(0.55))
                .frame(width: 2, height: WheelMetrics.dialThickness + 3)
                .offset(y: -radius)
                .rotationEffect(.degrees(turn * 360))
        }
    }

    /// One entry per hour the length runs for. The first is the ring itself; the rest are thinner,
    /// darker laps stacked inside the marks, each obviously a layer above the last rather than more
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
            let inset = WheelMetrics.ringInset + WheelMetrics.dialThickness + 2 + CGFloat(index - 1) * 7
            return (index, turn, inset, 4.5, max(0.75 - Double(index - 1) * 0.15, 0.35))
        }
    }
}

/// The screen a category collapses into: the ring becomes a clock face, one lap of it an hour, and
/// the crown sets how much of it this session gets. The ring is drawn a fifth larger than the space
/// it is given, bleeding past its own edge the way a watch face's dial usually does; the length sits
/// in the hole at its middle, and the category and the button that starts it sit below the ring
/// rather than crowded into that same hole.
struct DurationDialView: View {
    @Bindable var planner: TrackingPlanner
    let onStart: (TrackingPlan) -> Void

    /// How much bigger than the space it is offered the ring draws itself.
    private static let overscale: CGFloat = 1.2

    @FocusState private var crownFocused: Bool

    private var color: Color { Color(hex: planner.category.color) }

    var body: some View {
        RingFace(color: color, minutes: planner.minutes, isFree: planner.isFree, tickTurns: tickTurns)
            .scaleEffect(Self.overscale)
            .overlay { lengthReadout }
            .overlay(alignment: .bottom) { bottomControls }
            .modifier(CrownControl(planner: planner, focused: $crownFocused))
            .onAppear { crownFocused = true }
    }

    // MARK: - The middle

    private var lengthReadout: some View {
        VStack(spacing: 2) {
            Text(lengthText)
                .font(.system(size: 25, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                // Kept clear of the inner laps a long session stacks up behind it.
                .frame(maxWidth: 92)

            if let ticksText {
                Text(ticksText)
                    .font(.system(size: 10))
                    .foregroundStyle(color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        // Everything here has to live inside the hole in the middle of the ring, which is what this
        // inset is measuring out — the ring's thickness plus the room its marks take.
        .padding(WheelMetrics.ringInset + WheelMetrics.dialThickness + 12)
    }

    // MARK: - Below the ring

    private var bottomControls: some View {
        VStack(spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: Icons.symbol(for: planner.category.icon))
                    .font(.system(size: 11, weight: .semibold))
                Text(planner.category.name)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(color)

            Button {
                onStart(planner.plan)
            } label: {
                Image(systemName: "play.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.black)
                    .frame(width: 48, height: 25)
                    .background(color, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 2)
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
                focusable(content).digitalCrownRotation(
                    $planner.minutes, from: 0, through: 240, by: 5,
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
        .onChange(of: planner.minutes) { _, _ in
            planner.tickEvery = min(planner.tickEvery, planner.tickEveryRange.upperBound)
        }
    }

    private func focusable(_ content: Content) -> some View {
        content.focusable().focused($focused)
    }
}
