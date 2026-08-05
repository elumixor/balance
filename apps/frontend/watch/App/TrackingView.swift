import SwiftUI
import BalanceKit

/// The main screen — launched straight into, no tab bar / nav chrome for the primary action.
/// Running: activity name + a live elapsed readout + a one-tap Stop button.
/// Idle: up to 6 recent/frequent activities as large one-tap start targets.
struct TrackingView: View {
    @State private var viewModel = TrackingViewModel()

    var body: some View {
        Group {
            if let running = viewModel.runningEntry {
                RunningTimerView(entry: running) {
                    Task { await viewModel.stop() }
                }
            } else if viewModel.isLoading && viewModel.quickActivities.isEmpty {
                ProgressView()
            } else {
                QuickStartListView(activities: viewModel.quickActivities) { activity in
                    Task { await viewModel.start(activity) }
                }
            }
        }
        .task { await viewModel.refresh() }
        .task {
            // Lightweight background poll so a stop/start triggered from the phone (or another
            // device) is reflected here without the user having to pull-to-refresh.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                await viewModel.refresh()
            }
        }
        .refreshable { await viewModel.refresh() }
    }
}

private struct RunningTimerView: View {
    let entry: Entry
    let onStop: () -> Void

    private var range: ClosedRange<Date> {
        entry.startedAt...entry.startedAt.addingTimeInterval(24 * 60 * 60)
    }

    var body: some View {
        VStack(spacing: 12) {
            Text(entry.activityName)
                .font(.headline)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            Text(timerInterval: range, countsDown: false)
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.5)

            Button(role: .destructive, action: onStop) {
                Label("Stop", systemImage: "stop.fill")
                    .font(.headline)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
        }
        .padding(.horizontal, 4)
    }
}

private struct QuickStartListView: View {
    let activities: [ActivityRef]
    let onStart: (ActivityRef) -> Void

    var body: some View {
        if activities.isEmpty {
            VStack(spacing: 6) {
                Text("No activities yet")
                    .font(.headline)
                Text("Add activities in Balance on your iPhone.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding()
        } else {
            List(activities) { activity in
                Button {
                    onStart(activity)
                } label: {
                    Text(activity.name)
                        .font(.body)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.bordered)
                .tint(.accentColor)
            }
            .listStyle(.carousel)
        }
    }
}
