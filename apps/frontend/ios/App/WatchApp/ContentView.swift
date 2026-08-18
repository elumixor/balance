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
                        } else {
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

    /// Two bands: the ring takes everything it can get, and the next thing on the calendar sits
    /// under it. Nothing else is drawn while idle — a wrist-sized screen buys a bigger target to
    /// aim at by spending the words it could have printed above it.
    private var screen: some View {
        VStack(spacing: 0) {
            if let active = sessions.active {
                ActiveSessionView(
                    session: active,
                    isBusy: sessions.isBusy,
                    onFinish: { Task { await sessions.stop() } },
                    onExtend: { minutes in Task { await sessions.extendBy(minutes: minutes) } }
                )
            } else {
                gestureSurface
                    // The readout is an overlay rather than a band of its own, so the name appearing
                    // under the finger costs the ring no height.
                    .overlay(alignment: .bottom) {
                        if planner == nil {
                            CategoryFocusReadout(category: wheel.focusedCategory)
                        }
                    }
            }

            if let message = errorMessage {
                Text(message)
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }

            // What is coming up is a thing to know at a glance, not while aiming: a finger on the
            // ring is halfway through a decision, and the line below it only competes for the eye.
            NextEventLine(event: wheel.isPressing || planner != nil ? nil : summary.nextEvent)
                .animation(.easeOut(duration: 0.15), value: wheel.isPressing)
        }
    }

    // MARK: - Idle bands

    /// The middle band. The ring rests dim until a finger is on it, then comes up to full while the
    /// drag decides which segment it points at.
    private var gestureSurface: some View {
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
                CategoryWheel(model: wheel, chosenIndex: planner?.index)
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
                    .allowsHitTesting(planner == nil)

                if let planner {
                    DurationDialView(planner: planner) { plan in
                        Task { await start(plan: plan, planner: planner) }
                    }
                    .transition(.opacity)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
    /// on. The index has to be read before `ended()`, which clears the gesture behind it.
    private func choose() {
        guard let index = wheel.focusedIndex, let category = wheel.ended() else { return }
        withAnimation(WheelMetrics.collapse) {
            planner = TrackingPlanner(category: category, index: index)
        }
    }

    private func start(plan: TrackingPlan, planner: TrackingPlanner) async {
        withAnimation(WheelMetrics.collapse) { self.planner = nil }
        if plan.duration.minutes != nil || plan.ticks != .off {
            await TrackingAlarm.requestAuthorizationIfNeeded()
        }
        await sessions.start(category: planner.category, plan: plan)
        // Starting a session writes an event into the week the ring is drawn from, so the numbers
        // under the finger are stale the moment it lands.
        await reload()
    }
}

private enum Route: Hashable {
    case calendar
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
            } else {
                Color.clear
            }
        }
        .frame(height: 30)
        .padding(.bottom, -8)
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
