import WidgetKit
import SwiftUI

struct BalanceEntry: TimelineEntry {
    let date: Date
}

struct BalanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> BalanceEntry {
        BalanceEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (BalanceEntry) -> Void) {
        completion(BalanceEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BalanceEntry>) -> Void) {
        completion(Timeline(entries: [BalanceEntry(date: Date())], policy: .after(Date().addingTimeInterval(60 * 15))))
    }
}

struct BalanceWidgetView: View {
    var entry: BalanceProvider.Entry

    var body: some View {
        Text("Not tracking")
            .font(.caption)
    }
}

struct BalanceWidget: Widget {
    let kind: String = "BalanceWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceProvider()) { entry in
            BalanceWidgetView(entry: entry)
        }
        .configurationDisplayName("Balance")
        .description("Shows what you're currently tracking.")
    }
}
