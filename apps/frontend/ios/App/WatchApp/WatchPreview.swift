import Foundation
import BalanceKit

/// A week's worth of made-up data, for running the watch app on a simulator.
///
/// The watch signs in by redeeming a ticket from the phone, so a simulator with no paired iPhone can
/// only ever show the "open Balance on your iPhone" card — and the ring, the close-up under a drag
/// and the duration dial are all gestures, which have to be felt rather than reasoned about. With
/// `BALANCE_WATCH_PREVIEW=1` in the environment the screens are drawn from this instead of from the
/// API, and nothing is ever written back. Set it by hand in an Xcode scheme — `devkit dev:iwatch`
/// launches with `BALANCE_DEV_AUTH=1` instead, which is the same simulator against real data (see
/// `DevAuth`). This is what is left for the case where there is no backend to talk to at all.
///
/// It is compiled into debug builds only, so there is no path from a shipped app to this data.
enum WatchPreview {
    #if DEBUG
        static let isEnabled = ProcessInfo.processInfo.environment["BALANCE_WATCH_PREVIEW"] == "1"

        static var summary: WatchSummary? {
            guard isEnabled else { return nil }
            let now = Date()
            return WatchSummary(
                connected: true,
                needsReconnect: false,
                weekStart: now.addingTimeInterval(-3 * 86400),
                now: now,
                categories: [
                    WatchCategory(
                        id: "1", name: "Deep work", color: "#7C5CFF", icon: "brain",
                        targetHours: 20, actualHours: 13.5
                    ),
                    WatchCategory(
                        id: "2", name: "Meetings", color: "#38BDF8", icon: "users",
                        targetHours: 8, actualHours: 6
                    ),
                    WatchCategory(
                        id: "3", name: "Sport", color: "#34D399", icon: "dumbbell",
                        targetHours: 5, actualHours: 2
                    ),
                    WatchCategory(
                        id: "4", name: "Learning", color: "#FBBF24", icon: "book-open",
                        targetHours: 6, actualHours: 4.25
                    ),
                    WatchCategory(
                        id: "5", name: "Family", color: "#F472B6", icon: "heart",
                        targetHours: 10, actualHours: 7
                    ),
                ],
                nextEvent: sampleEvents(now).first,
                active: nil,
                upcoming: sampleEvents(now)
            )
        }

        /// A day and a half of made-up calendar, so the upcoming list has day headings to draw and
        /// a block already running to show the "now" row against.
        private static func sampleEvents(_ now: Date) -> [NextEvent] {
            [
                NextEvent(
                    id: "e1", calendarId: "c1", title: "Design review",
                    start: now.addingTimeInterval(35 * 60), end: now.addingTimeInterval(95 * 60),
                    inProgress: false, categoryId: "2", categoryName: "Meetings",
                    categoryColor: "#38BDF8", categoryIcon: "users"
                ),
                NextEvent(
                    id: "e2", calendarId: "c1", title: "Write the release notes",
                    start: now.addingTimeInterval(3 * 3600), end: now.addingTimeInterval(5 * 3600),
                    inProgress: false, categoryId: "1", categoryName: "Deep work",
                    categoryColor: "#7C5CFF", categoryIcon: "brain"
                ),
                NextEvent(
                    id: "e3", calendarId: "c1", title: "Swim",
                    start: now.addingTimeInterval(26 * 3600), end: now.addingTimeInterval(27 * 3600),
                    inProgress: false, categoryId: "3", categoryName: "Sport",
                    categoryColor: "#34D399", categoryIcon: "dumbbell"
                ),
            ]
        }
    #else
        static let isEnabled = false
        static var summary: WatchSummary? { nil }
    #endif
}
