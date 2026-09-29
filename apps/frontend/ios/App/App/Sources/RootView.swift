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
        .overlay(alignment: .top) { ProblemBanner() }
        .task { await store.refresh() }
        .onChange(of: phase) { _, now in
            if now == .active { Task { await store.refresh() } }
            if now == .background { store.persist() }
        }
        .onChange(of: store.eventsVersion) { _, _ in plan() }
        .onAppear {
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
