import SwiftUI
import BalanceKit
import ClerkKit

/// Where the app is. The only route besides the tracking screen is the write-calendar picker, and
/// the widget's deep link is a request to be back on the tracking screen, so "handle a URL" is the
/// same operation as "pop to the root".
@MainActor
@Observable
final class WatchRouter {
    var path = NavigationPath()

    func handle(_ url: URL) {
        guard url.scheme == "balance" else { return }
        path = NavigationPath()
    }
}

/// What the ring is currently being used for. There is one screen, not three: the same ring picks a
/// category, then sets a length, then counts a session down, and this says which of those it is
/// doing so every part of the screen can animate between them off a single value.
enum TrackingPhase: Equatable {
    case idle
    case planning
    case running
}

/// Root view. There is no sign-in on the watch: `WatchPairing` redeems a ticket the phone app
/// pushes across, and what shows here is whichever side of that has happened — the tracker once
/// there is a session, and a card asking for the phone until then.
struct ContentView: View {
    @Environment(Clerk.self) private var clerk
    @Environment(WatchRouter.self) private var router
    @Environment(\.scenePhase) private var scenePhase

    @State private var pairing = WatchPairing()
    @State private var summary = WatchSummaryModel()
    @State private var sessions = SessionController.shared
    @State private var wheel = WheelGestureModel()

    /// Set by letting go of the ring, cleared by starting or cancelling. Nothing is written while
    /// this is non-nil — the drag has only nominated a category, and the ring it was picked off is
    /// now the dial its length is set on.
    @State private var planner: TrackingPlanner?

    /// Where the week's ring was sitting when the finger lifted. The close-up has pushed the chosen
    /// band away from the middle of the screen, and the session's ring is drawn centred — so it
    /// arrives at the offset the band was left at and slides home, which is what makes the two read
    /// as one ring rather than a swap.
    @State private var handoff: CGSize = .zero

    /// The ring's own square, kept so the handover can be worked out without a view to ask.
    @State private var ringSize: CGSize = .zero

    /// How wide the drag readout turned out to be, so it can be kept on screen without being pinned
    /// to a fixed width it rarely needs.
    @State private var readoutSize: CGSize = .zero

    var body: some View {
        Group {
            if clerk.session != nil || WatchPreview.isEnabled || DevAuth.isEnabled {
                tracker
            } else {
                NotSignedInView(isPairing: pairing.isPairing)
            }
        }
        // Asked on every appearance and every wrist raise, not only at launch: a session can lapse
        // while the screen is off, and the ticket that replaces it may already be waiting.
        .task { pairing.ensureSession() }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            pairing.ensureSession()
        }
    }

    private var tracker: some View {
        @Bindable var router = router

        return NavigationStack(path: $router.path) {
            screen
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        if planner != nil {
                            Button {
                                withAnimation(WheelMetrics.collapse) { planner = nil }
                            } label: {
                                Image(systemName: "xmark")
                            }
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        if let planner {
                            Button { planner.cycleTicks() } label: {
                                Image(systemName: planner.tickGlyph)
                            }
                        } else if phase == .idle {
                            NavigationLink(value: Route.calendar) {
                                Image(systemName: "gearshape")
                            }
                        }
                    }
                }
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .calendar: CalendarSettingsView()
                    }
                }
        }
        .task { await reload() }
        .onChange(of: scenePhase) { _, phase in
            // A wrist raise is the watch equivalent of opening the app, and the week may have moved
            // on (or the phone may have started something) while the screen was off.
            guard phase == .active else { return }
            Task { await reload() }
        }
        .onChange(of: summary.categories) { _, categories in
            wheel.categories = categories
        }
        // Asked after a timer ends, and not before: a session started from a reminder already knows
        // what it was for, and one that matched nothing on the calendar has nothing to be asked.
        .sheet(item: $sessions.pendingMatch) { prompt in
            MatchPromptView(prompt: prompt) { candidate in
                Task {
                    await sessions.answerMatch(with: candidate)
                    await reload()
                }
            }
        }
    }

    // MARK: - Phase

    private var phase: TrackingPhase {
        if planner != nil { return .planning }
        return sessions.active == nil ? .idle : .running
    }

    /// The band the ring has committed to, whether it is being dialled or already running. It is
    /// what turns the week into a single lap: everything else collapses to nothing around it.
    private var chosenIndex: Int? {
        if let planner { return planner.index }
        guard let active = sessions.active else { return nil }
        return summary.categories.firstIndex { $0.id == active.categoryId }
    }

    /// The whole screen: the ring takes everything above a band of its own height at the bottom,
    /// which carries whatever the current phase has to say — what is coming up while idle, and the
    /// session's controls once one is being set up or run. The band is a band rather than an
    /// overlay because a control sitting on the ring's lower arc reads as part of it, and the arc
    /// is the one thing on this screen that has to be read at a glance.
    private var screen: some View {
        VStack(spacing: 0) {
            ring

            if let message = errorMessage {
                Text(message)
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }

            bottomBand
                .frame(height: Self.bandHeight)
        }
        .animation(WheelMetrics.collapse, value: phase)
    }

    /// How much of the screen's bottom the band keeps for itself, in every phase, so the ring above
    /// it is the same size whatever is down there.
    private static let bandHeight: CGFloat = 30

    // MARK: - The ring

    /// The middle of the screen, all of it. The week's ring, the dial it collapses into and the
    /// session it becomes are the same stack of shapes — nothing is pushed on top of anything, so
    /// the parts that carry over can travel instead of being swapped.
    private var ring: some View {
        GeometryReader { proxy in
            let active = planner == nil ? sessions.active : nil
            // One clock for the whole ring while a session runs: the arc is the elapsed time, and
            // the arc and the numbers inside it must not be told the time by two different ticks.
            //
            // The timeline is always there, even with nothing running and nothing to tick for. Two
            // branches would mean the whole stack is a different view before and after a session,
            // and a view that is replaced cannot transition — which is what left the finished ring
            // hanging on screen behind the week it had already been swapped for.
            TimelineView(.periodic(from: active?.startedAt ?? .now, by: active == nil ? 60 : 1)) { context in
                stack(in: proxy.size, now: context.date, active: active)
            }
            .onChange(of: proxy.size, initial: true) { _, size in ringSize = size }
        }
    }

    /// The radius the wheel draws itself at, worked out the same way it does: the ring is fitted
    /// square into whatever the screen leaves it.
    private var ringRadius: CGFloat {
        min(ringSize.width, ringSize.height) / 2 - WheelMetrics.ringInset
    }

    @ViewBuilder
    private func stack(in size: CGSize, now: Date, active: ActiveSession?) -> some View {
        ZStack {
            if summary.needsCalendar {
                Text("Connect a calendar in Balance on your iPhone")
                    .font(.caption2)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            } else if summary.categories.isEmpty {
                Text(summary.hasLoaded ? "No categories yet" : "")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                CategoryWheel(model: wheel, leaving: phase != .idle)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                if !wheel.isPressing { wheel.began(at: value.startLocation) }
                                wheel.moved(to: value.location)
                            }
                            .onEnded { _ in choose() }
                    )
                    // The ring stops being a picker the moment it becomes a dial — the crown takes
                    // over, and a stray touch must not start a second choice on top of the first.
                    .allowsHitTesting(phase == .idle)

                // The session's ring arrives from behind the week's, which is on its way out towards
                // the viewer. They cross rather than one becoming the other.
                if let planner {
                    DurationDialView(planner: planner)
                        .transition(sessionRing)
                } else if let active {
                    RunningSessionView(session: active, now: now)
                        .transition(sessionRing)
                }

                // The readout follows the finger rather than sitting in a fixed band, so it never
                // costs the ring height and is always where the eye already is.
                if phase == .idle, let location = wheel.location {
                    CategoryFocusReadout(category: wheel.focusedCategory)
                        .measured(into: $readoutSize)
                        .position(readoutPosition(for: location, in: size))
                        .animation(.easeOut(duration: 0.15), value: wheel.focusedCategory)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// The session's ring arriving and leaving. Only the arrival carries the handover offset: it
    /// comes in where the chosen band was left and travels to the middle, while a dial that is being
    /// dismissed has nothing to travel back to — by then the week's ring is centred again.
    private var sessionRing: AnyTransition {
        let cross = AnyTransition.scale(scale: WheelMetrics.enterScale).combined(with: .opacity)
        return .asymmetric(
            insertion: cross.combined(with: .offset(handoff)),
            removal: cross
        )
    }

    /// How far the readout floats from the finger, centre to centre. Constant: the card keeps the
    /// same gap wherever the drag goes, so the eye never has to re-find it mid-reach.
    private let readoutGap: CGFloat = 44
    /// How much of the finger's distance from the middle the readout copies, sideways.
    private let readoutDrift: CGFloat = 0.5
    private let readoutMargin: CGFloat = 6

    /// Where the readout sits: always the same gap above the finger, and pulled half of the way
    /// back towards the middle of the ring horizontally. Following the finger's x exactly would
    /// push a line this wide against the edge on every reach outwards; half of it keeps the readout
    /// under the eye without ever needing to be shoved back on screen. The y is never clamped or
    /// flipped below — the card staying in one place relative to the thumb is worth more than the
    /// top edge of it, which the ring's own top rarely reaches anyway.
    private func readoutPosition(for location: CGPoint, in size: CGSize) -> CGPoint {
        let halfWidth = max(readoutSize.width, 40) / 2
        let centre = size.width / 2
        let aimed = centre + (location.x - centre) * readoutDrift
        let x = min(max(aimed, halfWidth + readoutMargin), size.width - halfWidth - readoutMargin)
        return CGPoint(x: x, y: location.y - readoutGap)
    }

    // MARK: - The band underneath

    @ViewBuilder
    private var bottomBand: some View {
        switch phase {
        case .idle:
            // What is coming up is a thing to know at a glance, not while aiming: a finger on the
            // ring is halfway through a decision, and the line below it only competes for the eye.
            NextEventLine(event: wheel.isPressing ? nil : summary.nextEvent)
                .animation(.easeOut(duration: 0.15), value: wheel.isPressing)
                .transition(.opacity)
        case .planning:
            if let planner {
                RingButton(symbol: "play.fill", tint: Color(hex: planner.category.color)) {
                    Task { await start(plan: planner.plan, planner: planner) }
                }
                .transition(.opacity)
            }
        case .running:
            if let active = sessions.active {
                RunningControls(
                    session: active,
                    isBusy: sessions.isBusy,
                    onFinish: { Task { await sessions.stop() } }
                )
                .transition(.opacity)
            }
        }
    }

    private var errorMessage: String? { sessions.errorMessage ?? summary.errorMessage }

    // MARK: - Actions

    /// One request answers the whole screen, so the session controller is fed from it rather than
    /// asking again; handing it over is also what writes the widget's blob.
    private func reload() async {
        await summary.refresh()
        if let value = summary.summary { sessions.apply(summary: value) }
        // The reminder is only ever scheduled when there is no iPhone to schedule it instead; the
        // offer to start a timer as the event begins is the watch's own — see `EventAlarm`. Asked
        // on every summary, because a cancelled event has to take both with it.
        EventAlarm.sync(next: summary.nextEvent, reminders: summary.summary?.reminders, active: sessions.active)
    }

    /// The drag has landed on a segment: the ring keeps it and becomes the dial its length is set
    /// on. The gesture is always ended, even when it picked nothing — a press released in the dead
    /// zone still has to put the ring back the way it found it.
    private func choose() {
        let index = wheel.focusedIndex
        let pan = wheel.pan
        let categories = wheel.categories
        let category = wheel.ended()
        guard let index, let category else { return }
        handoff = CategoryWheel.cameraOffset(
            layout: WheelLayout(categories: categories),
            focusedIndex: index,
            pan: pan,
            radius: ringRadius
        )
        withAnimation(WheelMetrics.collapse) {
            planner = TrackingPlanner(category: category, index: index)
        }
    }

    private func start(plan: TrackingPlan, planner: TrackingPlanner) async {
        if plan.duration.minutes != nil || plan.ticks != .off {
            await TrackingAlarm.requestAuthorizationIfNeeded()
        }
        // The controller sets its optimistic session before it reaches the network, so clearing the
        // planner first means the running ring is already there in the same frame the dial leaves —
        // the lap never blinks back to a week in between.
        // The running ring replaces the dial in place — the handover was the week's ring becoming a
        // lap, and that already happened.
        handoff = .zero
        self.planner = nil
        await sessions.start(category: planner.category, plan: plan)
        // Starting a session writes an event into the week the ring is drawn from, so the numbers
        // under the finger are stale the moment it lands.
        await reload()
    }
}

private enum Route: Hashable {
    case calendar
}

/// The one action under the ring, sitting in the screen's bottom margin with enough shadow under it
/// that the arc it overlaps reads as being behind it rather than running through it.
struct RingButton: View {
    let symbol: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.black)
                .frame(width: 54, height: 28)
                .background(tint, in: Capsule())
        }
        .buttonStyle(.plain)
        .ringButtonShadow()
    }
}

extension View {
    /// What keeps a control legible over the ring: a hard black halo that fades the arc out right
    /// around the control, without a panel that would cut the ring in half.
    func ringButtonShadow() -> some View {
        shadow(color: .black.opacity(0.9), radius: 5)
            .shadow(color: .black.opacity(0.8), radius: 10)
    }

    /// Reports this view's own size, so something positioned by hand can be kept on screen without
    /// being given a width it does not need.
    func measured(into size: Binding<CGSize>) -> some View {
        background(
            GeometryReader { proxy in
                Color.clear.preference(key: MeasuredSizeKey.self, value: proxy.size)
            }
        )
        .onPreferenceChange(MeasuredSizeKey.self) { new in
            Task { @MainActor in size.wrappedValue = new }
        }
    }
}

private struct MeasuredSizeKey: PreferenceKey {
    static let defaultValue = CGSize.zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) { value = nextValue() }
}

/// The bottom band: the next thing on the calendar, its title on one line and how far away it is on
/// the next, wearing the glyph of whatever category it counts towards so the band says what kind of
/// thing is coming without being read. It keeps its height when there is nothing coming, so the ring
/// above it does not shift as events pass.
///
/// It sits in the screen's bottom safe area on purpose: watchOS keeps a generous margin there for
/// the home gesture, and a line this quiet can live in it without being in the way.
private struct NextEventLine: View {
    let event: NextEvent?

    var body: some View {
        Group {
            if let event {
                VStack(spacing: 1) {
                    HStack(spacing: 4) {
                        Image(systemName: glyph(for: event))
                            .font(.system(size: 10))
                            .foregroundStyle(tint(for: event))
                        Text(event.title)
                            .lineLimit(1)
                    }
                    timing(for: event)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .font(.caption2)
                .minimumScaleFactor(0.7)
                .ringButtonShadow()
            } else {
                Color.clear
            }
        }
        .padding(.bottom, -6)
    }

    /// The category's glyph when the event counts towards one, and the calendar's own otherwise —
    /// an unmapped event is exactly the one the watch knows nothing else about.
    private func glyph(for event: NextEvent) -> String {
        guard let icon = event.categoryIcon else { return event.inProgress ? "record.circle" : "calendar" }
        return Icons.symbol(for: icon)
    }

    private func tint(for event: NextEvent) -> Color {
        event.categoryColor.map { Color(hex: $0) } ?? .secondary
    }

    /// How long until it matters: until it starts while it is still coming, and until it is over
    /// once it has begun — "now" says the event is happening and nothing about how much of it is
    /// left, which is the part worth glancing at.
    ///
    /// `.relative` keeps counting down without this view being redrawn, which matters on a screen
    /// the system stops updating the moment the wrist drops.
    private func timing(for event: NextEvent) -> Text {
        guard event.inProgress else { return Text("in ") + Text(event.start, style: .relative) }
        guard event.end > event.start else { return Text("now") }
        return Text(event.end, style: .relative) + Text(" left")
    }
}
