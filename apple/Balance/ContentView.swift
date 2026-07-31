import SwiftUI
import ClerkKit

struct ContentView: View {
    @Environment(Clerk.self) private var clerk

    var body: some View {
        Group {
            if !clerk.isLoaded {
                ProgressView()
            } else if clerk.user != nil {
                MainTabView()
            } else {
                AuthView()
            }
        }
        .animation(.default, value: clerk.user?.id)
    }
}

#Preview {
    ContentView()
        .environment(Clerk.shared)
}
