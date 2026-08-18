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
    @State private var sessions = SessionController()
    @State private var wheel = WheelGestureModel()

    /// Set by letting go of the ring, cleared by starting or cancelling. Nothing is written while
    /// this is non-nil — the drag has only nominated a category, and the ring it was picked off is
    /// now the dial its length is set on.
    @State private var planner: TrackingPlanner?

    /// The one thing that travels between the ring and the readouts below it: the chosen category's
    /// glyph, which flies from its band into the label under the clock instead of one fading out
    /// while a copy fades in somewhere else.
    @Namespace private var glyphs

    /// How wide the drag readout turned out to be, so it can be kept on screen without being pinned
    /// to a fixed width it rarely needs.
    @State private var readoutSize: CGSize = .zero

    var body: some View {
        Group {
            if clerk.session != nil || WatchPreview.isEnabled {
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
        // A fixed session is over when its time is up, whoever is looking: the app finishes it
        // itself rather than leaving a timer running past its own end waiting to be told.
        .task(id: sessions.active?.plannedEndAt) {
            guard let end = sessions.active?.plannedEndAt else { return }
            let wait = end.timeIntervalSinceNow
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled, sessions.active?.plannedEndAt == end else { return }
            await sessions.stop()
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
                    CategoryWheel(model: wheel, chosenIndex: chosenIndex, glyphs: glyphs)
                        .opacity(phase == .running && chosenIndex == nil ? 0 : 1)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    if !wheel.isPressing { wheel.began(at: value.startLocation) }
                                    wheel.moved(to: value.location)
                                }
                                .onEnded { _ in choose() }
                        )
                        // The ring stops being a picker the moment it becomes a dial — the crown
                        // takes over, and a stray touch must not start a second choice on top of
                        // the first.
                        .allowsHitTesting(phase == .idle)

                    if let planner {
                        DurationDialView(planner: planner, glyphs: glyphs)
                    } else if let active = sessions.active {
                        RunningSessionView(session: active, glyphs: glyphs)
                    }

                    // The readout follows the finger rather than sitting in a fixed band, so it
                    // never costs the ring height and is always where the eye already is.
                    if phase == .idle, let location = wheel.location {
                        CategoryFocusReadout(category: wheel.focusedCategory)
                            .measured(into: $readoutSize)
                            .position(readoutPosition(for: location, in: proxy.size))
                            .animation(.easeOut(duration: 0.15), value: wheel.focusedCategory)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// How far above the finger the readout floats, as a multiple of how far the finger has already
    /// travelled: it starts close to the touch and rises out of the way as the drag reaches for the
    /// rim, which is exactly when the hand is covering the most of the ring.
    private let readoutRise: CGFloat = 2.2
    /// How much of the finger's distance from the middle the readout copies, sideways.
    private let readoutDrift: CGFloat = 0.5
    private let readoutMargin: CGFloat = 6

    /// Where the readout sits: lifted above the finger, and pulled half of the way back towards the
    /// middle of the ring horizontally. Following the finger's x exactly would push a line this wide
    /// against the edge on every reach outwards; half of it keeps the readout under the eye without
    /// ever needing to be shoved back on screen.
    private func readoutPosition(for location: CGPoint, in size: CGSize) -> CGPoint {
        let halfWidth = max(readoutSize.width, 40) / 2
        let halfHeight = max(readoutSize.height, 20) / 2
        let travel = hypot(wheel.pan.width, wheel.pan.height)
        let centre = size.width / 2
        let aimed = centre + (location.x - centre) * readoutDrift
        let x = min(max(aimed, halfWidth + readoutMargin), size.width - halfWidth - readoutMargin)
        let y = max(location.y - travel * readoutRise, halfHeight + readoutMargin)
        return CGPoint(x: x, y: y)
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
                    onFinish: { Task { await sessions.stop() } },
                    onExtend: { minutes in Task { await sessions.extendBy(minutes: minutes) } }
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
    }

    /// The drag has landed on a segment: the ring keeps it and becomes the dial its length is set
    /// on. The gesture is always ended, even when it picked nothing — a press released in the dead
    /// zone still has to put the ring back the way it found it.
    private func choose() {
        let index = wheel.focusedIndex
        let category = wheel.ended()
        guard let index, let category else { return }
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
