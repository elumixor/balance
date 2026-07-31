import SwiftUI
import BalanceKit
import ClerkKit

@main
struct BalanceApp: App {
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
