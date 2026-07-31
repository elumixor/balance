import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            TrackView()
                .tabItem { Label("Track", systemImage: "timer") }

            StatsView()
                .tabItem { Label("Stats", systemImage: "chart.bar.fill") }

            ConfigView()
                .tabItem { Label("Config", systemImage: "gearshape.fill") }
        }
    }
}

#Preview {
    MainTabView()
}
