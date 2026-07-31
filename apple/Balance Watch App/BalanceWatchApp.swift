import SwiftUI
import BalanceKit
import ClerkKit

@main
struct BalanceWatchApp: App {
    init() {
        configureClerk()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(Clerk.shared)
        }
    }
}
