import SwiftUI

/// Page 1 (default landing page): tracking — start/stop, one tap.
/// Page 2 (horizontal swipe away): this week's actual-vs-target usage per category.
struct MainTabView: View {
    var body: some View {
        TabView {
            TrackingView()
            UsageView()
        }
        .tabViewStyle(.page(indexDisplayMode: .automatic))
    }
}
