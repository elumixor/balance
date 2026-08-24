import SwiftUI
import BalanceKit
import ClerkKit
import WatchKit

@main
struct BalanceWatchApp: App {
    /// The router lives here rather than in the root view because the deep link from the
    /// complication arrives at the scene, and it has to be able to reach a screen that may be
    /// buried under a pushed page.
    @State private var router = WatchRouter()

    init() {
        configureClerk()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(Clerk.shared)
                .environment(router)
                // Every widget family opens `balance://track`, meaning "show me the tracking
                // screen" — so the only thing to do with it is get back to the root.
                .onOpenURL { router.handle($0) }
        }

        // Reminders arrive in one of two categories — a call carries iOS's Join button, everything
        // else doesn't — whether the iPhone scheduled them and watchOS forwarded them or
        // `EventAlarm` scheduled them here. These draw both; without them they land as the
        // system's plain title-and-body card.
        WKNotificationScene(controller: EventNotificationController.self, category: EventAlarm.categoryID)
        WKNotificationScene(controller: EventNotificationController.self, category: EventAlarm.joinCategoryID)
    }
}
