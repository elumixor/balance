import BalanceKit
import ClerkKit
import SwiftUI

struct RootView: View {
    @Environment(Session.self) private var session

    var body: some View {
        Group {
            switch session.state {
            case .loading:
                LaunchView()
            case .signedOut:
                SignInView()
            case .signedIn:
                if let store = session.store {
                    MainView()
                        .environment(store)
                        .id(ObjectIdentifier(store))
                } else {
                    LaunchView()
                }
            }
        }
        .animation(.smooth, value: session.state)
        .onChange(of: session.state, initial: true) { _, _ in session.sessionChanged() }
    }
}

struct LaunchView: View {
    var body: some View {
        ProgressView()
            .controlSize(.large)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemBackground))
    }
}

/// The signed-in app: three tabs, one event card over all of them, and the problem banner.
struct MainView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var phase

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.tab) {
            Tab("Today", systemImage: "checklist", value: Router.Tab.agenda) {
                AgendaScreen()
            }
            Tab("Calendar", systemImage: "calendar", value: Router.Tab.calendar) {
                CalendarScreen()
            }
            Tab("Balance", systemImage: "chart.pie", value: Router.Tab.balance) {
                BalanceScreen()
            }
        }
        .sheet(item: $router.openEvent) { ref in
            EventSheet(eventKey: ref.key)
        }
        .sheet(isPresented: $router.settingsOpen) {
            SettingsScreen()
        }
        .fullScreenCover(item: $router.sessionOpen) { slot in
            SessionScreen(slot: slot)
        }
        .overlay(alignment: .top) { ProblemBanner() }
        .task { await launch() }
        .onChange(of: phase) { _, now in
            if now == .active { Task { await launch() } }
            if now == .background { store.persist() }
        }
        .onChange(of: store.eventsVersion) { _, _ in plan() }
        .onAppear {
            Reminders.shared.onSession = { raw in
                router.sessionOpen = SessionSummary.Slot(rawValue: raw) ?? store.sessionSlot
            }
            Reminders.shared.onOpen = { key in
                router.tab = .calendar
                if let event = store.event(key: key) { router.calendarFocus = event.start }
                router.openEvent = .init(key: key)
            }
            if session.mode == .live {
                WatchLink.shared.mint = { try await store.backend.watchTicket() }
                WatchLink.shared.push()
            }
        }
    }

    /// Everything a launch or a return to the app refreshes: the records and weeks, the sitting
    /// for the current slot, and the sitting reminders the server has written for the next days.
    private func launch() async {
        await store.refresh()
        await store.loadSession()
        guard session.mode == .live, let slots = try? await store.backend.sessionSlots() else { return }
        await Reminders.shared.rescheduleSessions(enabled: slots.enabled, slots: slots.slots, sound: store.preferences.reminders.sound)
    }

    /// Reminders are re-planned whenever the events move — debounced, since a refresh moves them
    /// several times in one breath.
    private func plan() {
        guard session.mode != .fixtures else { return }
        planTask?.cancel()
        planTask = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            let now = Date()
            let events = store.events(from: now, to: now.addingTimeInterval(49 * 3600))
            await Reminders.shared.reschedule(events: events, spheres: store.spheres, prefs: store.preferences.reminders)
        }
    }

    @State private var planTask: Task<Void, Never>?
}
