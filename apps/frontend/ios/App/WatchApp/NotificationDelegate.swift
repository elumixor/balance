import BalanceKit
import Foundation
import UserNotifications

/// Where a tap on a notification's button lands. The only button any of this app's notifications
/// carries is "Start timer" on the one that fires as an event begins (`EventAlarm`), and pressing
/// it starts the session the same way the ring would — through the one `SessionController`.
///
/// The event travels inside the notification: the app may have been terminated hours ago, and a
/// button that had to fetch the week before it could act would be a button that does nothing when
/// the wrist is down and the radio is off.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        // A reminder is worth showing even with the app in front — the screen it is showing is the
        // ring, and the ring says nothing about what is about to start.
        [.banner, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard response.actionIdentifier == EventAlarm.startActionID,
              let event = EventAlarm.event(in: response.notification.request.content.userInfo)
        else { return }
        await SessionController.shared.start(for: event)
    }
}
