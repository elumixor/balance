import SwiftUI
import BalanceKit
import ClerkKit

/// Root view. Clerk's built-in WatchConnectivity session sync means a user who already signed
/// in on their iPhone is signed in here automatically — there is no watch-native sign-in flow.
/// If no session has synced yet (fresh install, phone app never opened, or Watch Connectivity
/// hasn't delivered the context yet), we show a simple prompt instead of building one.
struct ContentView: View {
    @Environment(Clerk.self) private var clerk

    var body: some View {
        if clerk.session != nil {
            MainTabView()
        } else {
            NotSignedInView()
        }
    }
}
