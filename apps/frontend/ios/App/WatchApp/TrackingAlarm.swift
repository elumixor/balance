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

    /// Replaces any pending alarm with one for `date`. A date already in the past means the session
    /// is over as far as the alarm is concerned, so nothing is scheduled.
    static func schedule(categoryName: String, at date: Date) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [requestID])
        token += 1
        let mine = token

        let seconds = date.timeIntervalSinceNow
        guard seconds > 1 else { return }

        let content = UNMutableNotificationContent()
        content.title = categoryName
        content.body = "Time's up."
        content.sound = .default
        content.interruptionLevel = .timeSensitive

        let request = UNNotificationRequest(
            identifier: requestID,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        )

        Task { @MainActor in
            await requestAuthorizationIfNeeded()
            guard token == mine else { return }
            try? await center.add(request)
        }
    }

    static func cancel() {
        token += 1
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [requestID])
    }

    /// Played when the app happens to be in front — a start or a finish the user is watching should
    /// feel like it landed. The end-of-session haptic comes from the notification instead.
    static func playConfirmation() {
        WKInterfaceDevice.current().play(.click)
    }
}
