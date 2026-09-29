import BalanceKit
import BalanceTelemetry
import ClerkKit
import GoogleSignIn
import SwiftUI

@main
struct BalanceApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var session = Session()
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(router)
                // The chrome is achromatic: every hue on screen is one of the person's spheres.
                .tint(.primary)
                .onOpenURL { url in
                    if GIDSignIn.sharedInstance.handle(url) { return }
                    router.handle(url)
                }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let testing = ProcessInfo.processInfo.arguments.contains("-fixtures")
        if !testing { Telemetry.start(platform: "iOS") }
        Reminders.shared.install()
        WatchLink.shared.activate()
        // Swapping the icon raises a system alert, which a UI test would have to dismiss.
        if !testing { DailyIconManager.applyForToday() }
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        if !ProcessInfo.processInfo.arguments.contains("-fixtures") { DailyIconManager.applyForToday() }
    }
}

/// Which tab is showing and which event's card is open — the two things a notification, a
/// widget link or a tap in another tab may need to change.
@MainActor
@Observable
final class Router {
    enum Tab: Hashable { case agenda, calendar, balance }

    var tab: Tab = .agenda
    /// The event whose card is open, by its key.
    var openEvent: EventRef?
    var settingsOpen = false
    /// Set to make the calendar jump to a day.
    var calendarFocus: Date?

    struct EventRef: Identifiable, Hashable {
        let key: String
        var id: String { key }
    }

    func open(_ event: CalendarEvent) { openEvent = EventRef(key: event.key) }

    func show(day: Date) {
        calendarFocus = day
        tab = .calendar
    }

    func handle(_ url: URL) {
        guard url.scheme == "balance" else { return }
        switch url.host {
        case "calendar": tab = .calendar
        case "today", "agenda": tab = .agenda
        case "balance": tab = .balance
        default: break
        }
    }
}
