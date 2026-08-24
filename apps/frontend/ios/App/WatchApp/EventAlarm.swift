import BalanceKit
import Foundation
import UserNotifications
import WatchConnectivity

/// The reminder for what is next, when there is no iPhone to give it.
///
/// A local notification on the phone is mirrored to the wrist, and this app draws it itself
/// (`EventNotificationView`), so the ordinary case needs nothing here: the phone schedules, the
/// watch renders. Scheduling the same reminder on both sides would simply buzz twice.
///
/// What the phone cannot cover is a watch worn without it — the companion app uninstalled, or the
/// watch set up on its own. This app has its own session and asks the API for the week by itself,
/// so it can cover that case, and `sync` is the whole of it: schedule the next event's reminder
/// when nothing else will, and hold nothing pending otherwise.
///
/// Only `nextEvent` is ever scheduled, because only `nextEvent` is fetched. That is enough for a
/// wrist: the watch is asked for a summary on every raise, and the reminder after this one is
/// scheduled as soon as this one has passed.
@MainActor
enum EventAlarm {
    /// Shared with the phone's `actionTypeId` and with the notification scene, so a reminder from
    /// either side arrives in the same category and is drawn by the same view.
    static let categoryID = "balance.event"

    /// What the phone files a reminder for a call under — the same card, plus iOS's own Join
    /// button. Nothing here schedules one; it is named so the notification scene can claim it.
    static let joinCategoryID = "balance.event.join"

    private static let requestID = "balance.event.next"

    /// What is pending, as the identifier and the instant it was scheduled for. Re-scheduling an
    /// unchanged alarm on every wrist raise would be harmless but pointless, and would race the
    /// authorization prompt the way `TrackingAlarm` describes.
    private static var pending: (eventID: String, at: Date)?
    private static var token = 0

    /// True when the paired iPhone has the Balance app on it, in which case the phone owns the
    /// reminders and this side stays out of it.
    static var phoneHandlesReminders: Bool {
        guard WCSession.isSupported() else { return false }
        return WCSession.default.isCompanionAppInstalled
    }

    /// Called with every summary the watch fetches: the state of what is pending is made to match
    /// what the answer says, which includes taking an alarm back when the event was cancelled,
    /// moved out of reach, or answered by the phone instead.
    static func sync(next: NextEvent?, reminders: WatchReminders?) {
        let preferences = reminders ?? .defaults
        guard !phoneHandlesReminders, preferences.enabled, let next, !next.inProgress else { return cancel() }

        let lead = preferences.useCalendarReminders ? (next.reminderMinutes ?? preferences.leadMinutes)
            : preferences.leadMinutes
        let at = next.start.addingTimeInterval(-Double(lead) * 60)
        guard at.timeIntervalSinceNow > 1 else { return cancel() }
        guard pending?.eventID != next.id || pending?.at != at else { return }

        schedule(next, at: at)
    }

    private static func schedule(_ event: NextEvent, at: Date) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [requestID])
        token += 1
        let mine = token
        pending = (event.id, at)

        let content = UNMutableNotificationContent()
        content.title = event.title.isEmpty ? "Untitled" : event.title
        content.body = "Starts at \(timeFormatter.string(from: event.start))"
        content.sound = .default
        content.categoryIdentifier = categoryID
        content.userInfo = [
            "eventId": event.id,
            "kind": "starts",
            "color": event.categoryColor ?? "",
            "icon": event.categoryIcon ?? "",
        ]

        let request = UNNotificationRequest(
            identifier: requestID,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: at.timeIntervalSinceNow, repeats: false)
        )

        Task { @MainActor in
            await TrackingAlarm.requestAuthorizationIfNeeded()
            guard token == mine else { return }
            try? await center.add(request)
        }
    }

    static func cancel() {
        guard pending != nil else { return }
        token += 1
        pending = nil
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [requestID])
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter
    }()
}
