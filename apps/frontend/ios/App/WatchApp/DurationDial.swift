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
    /// than the rhythm it was given has to pull the rhythm down with it.
    var tickEveryRange: ClosedRange<Double> {
        let top = isFree ? 60.0 : max(5, (minutes - 5).rounded())
        return 5...max(top, 5)
    }
}

/// The screen a category collapses into: the ring becomes a clock face, one lap of it an hour, and
/// the crown sets how much of it this session gets. The middle carries the answer and the button
/// that acts on it, so the whole decision is one screen with nothing to scroll.
struct DurationDialView: View {
    @Bindable var planner: TrackingPlanner
    let onStart: (TrackingPlan) -> Void

    /// How many minutes one lap of the dial is worth.
    private static let lap = 60.0

    /// The steps the dial is marked in, and the longer marks that make it countable at a glance.
    private static let tickStep = 5.0
    private static let majorTickStep = 15.0

    @FocusState private var crownFocused: Bool

    private var color: Color { Color(hex: planner.category.color) }

    var body: some View {
        ZStack {
            marks
            arcs
        }
        // The middle is laid out inside the ring rather than beside it, so what it holds can never
        // push the dial itself smaller.
        .overlay { centre }
        // The crown drives whichever value the ticks button has pointed it at; the view is rebuilt
        // per mode so each one brings its own range and step with it.
        .modifier(CrownControl(planner: planner, focused: $crownFocused))
        .onAppear { crownFocused = true }
    }

    // MARK: - The face

    /// Five minutes to a mark, a quarter of an hour to a long one. They sit inside the ring so the
    /// arc stays the outermost thing on screen and the dial still reads as one object.
    private var marks: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            // The marks give way to the laps a long session stacks under the ring, so the two never
            // have to share a radius.
            let outer = size / 2 - WheelMetrics.ringInset - WheelMetrics.dialThickness - 3 - lapDepth

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
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    /// The length itself. The first hour is the ring; every hour after it is another lap drawn
    /// inside the one before, thinner and darker, so a long session reads as layers rather than as
    /// an arc that has quietly wrapped around and started lying.
    private var arcs: some View {
        GeometryReader { proxy in
            ZStack {
                ForEach(laps, id: \.index) { lap in
                    Band(
                        start: .zero,
                        sweep: .degrees(lap.turn * 360),
                        inset: lap.inset,
                        thickness: lap.thickness
                    )
                    .fill(color.opacity(lap.opacity))
                }

                if planner.mode != .duration {
                    ForEach(tickTurns, id: \.self) { turn in
                        Circle()
                            .fill(Color.white.opacity(0.9))
                            .frame(width: 3, height: 3)
                            .offset(y: -(min(proxy.size.width, proxy.size.height) / 2
                                - WheelMetrics.ringInset - WheelMetrics.dialThickness / 2))
                            .rotationEffect(.degrees(turn * 360))
                    }
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .animation(.easeOut(duration: 0.16), value: planner.minutes)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    /// One entry per hour the session runs for. The first is the ring itself; the rest are thinner,
    /// darker laps stacked inside the marks, each obviously a layer above the last rather than more
    /// of the same arc.
    private var laps: [(index: Int, turn: Double, inset: CGFloat, thickness: CGFloat, opacity: Double)] {
        guard !planner.isFree else { return [] }
        let minutes = planner.minutes.rounded()
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

    /// How far the extra laps reach in from under the ring, which is how much room the marks lose.
    private var lapDepth: CGFloat {
        CGFloat(max(laps.count - 1, 0)) * 7
    }

    /// Where the nudges fall, as fractions of a lap, so they can be seen sitting on the arc while
    /// the rhythm is being set.
    private var tickTurns: [Double] {
        planner.plan.tickOffsets.map { $0 / 60 / Self.lap }
    }

    // MARK: - The middle

    private var centre: some View {
        VStack(spacing: 0) {
            Image(systemName: Icons.symbol(for: planner.category.icon))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(color)

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

            Button {
                onStart(planner.plan)
            } label: {
                Image(systemName: "play.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.black)
                    .frame(width: 42, height: 22)
                    .background(color, in: Capsule())
            }
            // The bordered styles bring padding of their own, which is more than the hole in the
            // middle of the dial has to give.
            .buttonStyle(.plain)
            .padding(.top, 3)
        }
        // Everything here has to live inside the hole in the middle of the ring, which is what this
        // inset is measuring out — the ring's thickness plus the room its marks take.
        .padding(WheelMetrics.ringInset + WheelMetrics.dialThickness + 12)
    }

    private var lengthText: String {
        guard !planner.isFree else { return "Free" }
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
                    by: 5,
                    sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
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
