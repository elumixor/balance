import Foundation
import UserNotifications
import WatchKit

/// The end of a fixed session is announced by a local notification scheduled the moment the session
/// starts, not by a timer running inside the app. A watch app is suspended the instant the wrist
/// drops, so an in-process timer would simply never fire; a notification handed to the system
/// survives the app being suspended, terminated or the watch being locked, and watchOS plays the
/// haptic for us when it is delivered. The trade is that the alarm has to be rescheduled whenever
/// the planned end moves, which is what `schedule` does — it always replaces the pending request.
@MainActor
enum TrackingAlarm {
    private static let requestID = "balance.tracking.end"

    /// Which alarm is the current one. Adding a request has to wait for the authorization prompt to
    /// be answered, and a session can be finished — or swapped for another category — while that
    /// wait is still on. Removing a pending request cannot cancel one that has not been added yet,
    /// so every scheduling attempt carries the token it was made under and drops itself if a later
    /// `schedule` or `cancel` has since moved it on.
    private static var token = 0

    /// Asked for once, the first time a fixed session is started. Denial is not an error worth
    /// interrupting a two-second glance for: the session still runs, it just ends quietly.
    static func requestAuthorizationIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .notDetermined else { return }
        _ = try? await center.requestAuthorization(options: [.alert, .sound])
    }

    /// The ticks scheduled alongside the current alarm, so the next call can take them back out
    /// again — there is no way to ask the system to drop "everything with this prefix".
    private static var tickIDs: [String] = []

    /// The one call that puts the whole session in the system's hands: the end of it, if it has one,
    /// and the nudges along the way. It always replaces what was pending, so moving the end or
    /// changing the rhythm is the same operation as setting it in the first place.
    ///
    /// A tick carries no sound and no urgency: it is a haptic that says how far through you are, and
    /// there is nothing to do about it. The end keeps the sound, because it is the thing being
    /// waited for. An open-ended session has no end and so ticks on a repeat instead.
    static func schedule(
        categoryName: String,
        endingAt end: Date? = nil,
        ticksAt ticks: [Date] = [],
        repeatingEvery interval: TimeInterval? = nil
    ) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [requestID] + tickIDs)
        token += 1
        let mine = token

        var requests: [UNNotificationRequest] = []

        if let end, end.timeIntervalSinceNow > 1 {
            let content = UNMutableNotificationContent()
            content.title = categoryName
            content.body = "Time's up."
            content.sound = .default
            content.interruptionLevel = .timeSensitive
            requests.append(
                UNNotificationRequest(
                    identifier: requestID,
                    content: content,
                    trigger: UNTimeIntervalNotificationTrigger(
                        timeInterval: end.timeIntervalSinceNow, repeats: false
                    )
                )
            )
        }

        for (number, at) in ticks.enumerated() where at.timeIntervalSinceNow > 1 {
            requests.append(
                UNNotificationRequest(
                    identifier: "\(requestID).tick.\(number)",
                    content: tickContent(categoryName: categoryName),
                    trigger: UNTimeIntervalNotificationTrigger(
                        timeInterval: at.timeIntervalSinceNow, repeats: false
                    )
                )
            )
        }

        if let interval, interval >= 60 {
            requests.append(
                UNNotificationRequest(
                    identifier: "\(requestID).tick.repeating",
                    content: tickContent(categoryName: categoryName),
                    trigger: UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: true)
                )
            )
        }

        tickIDs = requests.map(\.identifier).filter { $0 != requestID }
        guard !requests.isEmpty else { return }

        Task { @MainActor in
            await requestAuthorizationIfNeeded()
            guard token == mine else { return }
            for request in requests { try? await center.add(request) }
        }
    }

    static func cancel() {
        token += 1
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [requestID] + tickIDs)
        tickIDs = []
    }

    private static func tickContent(categoryName: String) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = categoryName
        content.body = "Still going."
        content.interruptionLevel = .passive
        return content
    }

    /// Played when the app happens to be in front — a start or a finish the user is watching should
    /// feel like it landed.
    static func playConfirmation() {
        WKInterfaceDevice.current().play(.click)
    }

    /// The end of a session arriving on its own, with the app in front. watchOS does not deliver a
    /// notification to an app that is already on screen — no delegate can make it buzz, it is simply
    /// not shown — so the one moment the alarm exists for is the one moment it cannot cover. The app
    /// plays the haptic itself instead; the notification is what covers the wrist being down.
    static func playCompletion() {
        WKInterfaceDevice.current().play(.click)
    }
}
