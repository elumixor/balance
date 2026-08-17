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

/// Root view. Clerk's built-in WatchConnectivity session sync means a user who already signed
/// in on their iPhone is signed in here automatically — there is no watch-native sign-in flow.
/// If no session has synced yet (fresh install, phone app never opened, or Watch Connectivity
/// hasn't delivered the context yet), we show a simple prompt instead of building one.
struct ContentView: View {
    @Environment(Clerk.self) private var clerk
    @Environment(WatchRouter.self) private var router
    @Environment(\.scenePhase) private var scenePhase

    @State private var summary = WatchSummaryModel()
    @State private var sessions = SessionController()
    @State private var wheel = WheelGestureModel()

    /// Set by letting go of the ring, cleared by the confirmation sheet. Nothing is written while
    /// this is non-nil — the drag has only nominated a category.
    @State private var pendingCategory: WatchCategory?

    var body: some View {
        if clerk.session != nil {
            tracker
        } else {
            NotSignedInView()
        }
    }

    private var tracker: some View {
        @Bindable var router = router

        return NavigationStack(path: $router.path) {
            screen
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink(value: Route.calendar) {
                            Image(systemName: "gearshape")
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
        .sheet(item: $pendingCategory) { category in
            StartTrackingSheet(
                category: category,
                onStart: { duration in
                    pendingCategory = nil
                    Task { await start(category: category, duration: duration) }
                },
                onCancel: { pendingCategory = nil }
            )
        }
    }

    /// The three bands of the sketch: what is happening now on top, the interaction surface in the
    /// middle, and the next thing on the calendar as a single line at the bottom.
    private var screen: some View {
        VStack(spacing: 4) {
            if let active = sessions.active {
                ActiveSessionView(
                    session: active,
                    isBusy: sessions.isBusy,
                    onFinish: { Task { await sessions.stop() } },
                    onExtend: { minutes in Task { await sessions.extendBy(minutes: minutes) } }
                )
            } else {
                weekHeadline
                gestureSurface
                CategoryFocusReadout(category: wheel.focusedCategory, placeholder: hint)
            }

            if let message = errorMessage {
                Text(message)
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }

            NextEventLine(event: summary.nextEvent)
        }
    }

    // MARK: - Idle bands

    /// The top band while nothing is running: the week as one number, so the screen still says
    /// something useful when it is only glanced at.
    private var weekHeadline: some View {
        let totals = summary.weekTotals
        return HStack(spacing: 4) {
            if summary.isLoading && !summary.hasLoaded {
                ProgressView().controlSize(.mini)
            } else if totals.target > 0 {
                Text(hoursText(totals.actual))
                    .font(.system(.title3, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                Text("/ \(hoursText(totals.target))h this week")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text("Balance")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

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
                CategoryWheel(model: wheel)
                    .opacity(wheel.isPressing ? 1 : 0.3)
                    .animation(.easeOut(duration: 0.18), value: wheel.isPressing)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                if !wheel.isPressing { wheel.began(at: value.startLocation) }
                                wheel.moved(to: value.location)
                            }
                            .onEnded { _ in
                                if let category = wheel.ended() { pendingCategory = category }
                            }
                    )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var hint: String { wheel.isPressing ? "Drag to pick" : "Hold, then drag out" }

    private var errorMessage: String? { sessions.errorMessage ?? summary.errorMessage }

    // MARK: - Actions

    /// One request answers the whole screen, so the session controller is fed from it rather than
    /// asking again; handing it over is also what writes the widget's blob.
    private func reload() async {
        await summary.refresh()
        if let value = summary.summary { sessions.apply(summary: value) }
    }

    private func start(category: WatchCategory, duration: TrackingDuration) async {
        wheel.cancel()
        if duration.minutes != nil { await TrackingAlarm.requestAuthorizationIfNeeded() }
        await sessions.start(category: category, durationMinutes: duration.minutes)
        // Starting a session writes an event into the week the ring is drawn from, so the numbers
        // under the finger are stale the moment it lands.
        await reload()
    }
}

private enum Route: Hashable {
    case calendar
}

/// The bottom band: one line, the next thing on the calendar and how far away it is. It keeps its
/// height when there is nothing coming, so the bands above it do not shift as events pass.
private struct NextEventLine: View {
    let event: NextEvent?

    var body: some View {
        Group {
            if let event {
                HStack(spacing: 4) {
                    Image(systemName: event.inProgress ? "record.circle" : "calendar")
                        .font(.system(size: 9))
                    Text(event.title)
                        .lineLimit(1)
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
        .frame(height: 14)
    }

    /// `.relative` keeps counting down without this view being redrawn, which matters on a screen
    /// the system stops updating the moment the wrist drops.
    private func timing(for event: NextEvent) -> Text {
        event.inProgress ? Text("now") : Text("in ") + Text(event.start, style: .relative)
    }
}
