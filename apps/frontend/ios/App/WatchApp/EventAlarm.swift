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

    /// The other thing the watch says about what is next, and the one thing it says on its own
    /// whether or not there is a phone: as the event begins, an offer to time it. The phone has no
    /// timer to start, so this side never defers to it.
    static let startCategoryID = "balance.event.start"
    static let startActionID = "balance.event.start.timer"
    private static let startRequestID = "balance.event.begin"
    private static var pendingStart: (eventID: String, at: Date)?

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
    static func sync(next: NextEvent?, reminders: WatchReminders?, active: ActiveSession? = nil) {
        registerCategoriesOnce()
        syncStart(next: next, active: active)

        let preferences = reminders ?? .defaults
        guard !phoneHandlesReminders, preferences.enabled, let next, !next.inProgress else { return cancel() }

        let lead = preferences.useCalendarReminders ? (next.reminderMinutes ?? preferences.leadMinutes)
            : preferences.leadMinutes
        let at = next.start.addingTimeInterval(-Double(lead) * 60)
        guard at.timeIntervalSinceNow > 1 else { return cancel() }
        guard pending?.eventID != next.id || pending?.at != at else { return }

        schedule(next, at: at)
    }

    /// The offer to time what is next, as it begins. Only an event that counts as something can be
    /// timed — a session is pointed at a category — and an event already being timed needs no
    /// offer. Fires at the start itself rather than ahead of it: this is "it is time", not a
    /// warning, and the length the timer takes is measured from the tap.
    private static func syncStart(next: NextEvent?, active: ActiveSession?) {
        guard let next, next.categoryId != nil, !next.inProgress, active?.eventId != next.id,
              next.start.timeIntervalSinceNow > 1
        else { return cancelStart() }
        guard pendingStart?.eventID != next.id || pendingStart?.at != next.start else { return }

        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [startRequestID])
        token += 1
        let mine = token
        pendingStart = (next.id, next.start)

        let content = UNMutableNotificationContent()
        content.title = next.title.isEmpty ? "Untitled" : next.title
        content.body = "Starting now — \(next.durationMinutes) min"
        content.sound = .default
        content.interruptionLevel = .timeSensitive
        content.categoryIdentifier = startCategoryID
        content.userInfo = payload(for: next)

        let request = UNNotificationRequest(
            identifier: startRequestID,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: next.start.timeIntervalSinceNow, repeats: false)
        )
        Task { @MainActor in
            await TrackingAlarm.requestAuthorizationIfNeeded()
            guard token == mine else { return }
            try? await center.add(request)
        }
    }

    private static func cancelStart() {
        guard pendingStart != nil else { return }
        token += 1
        pendingStart = nil
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [startRequestID])
    }

    /// Everything `SessionController.start(for:)` needs, flattened into the notification so the
    /// button works with the app long since terminated. Read back by `event(in:)`.
    private static func payload(for event: NextEvent) -> [String: Any] {
        var info: [String: Any] = [
            "eventId": event.id,
            "calendarId": event.calendarId,
            "kind": "start",
            "title": event.title,
            "start": ISO8601.string(from: event.start),
            "end": ISO8601.string(from: event.end),
            "color": event.categoryColor ?? "",
            "icon": event.categoryIcon ?? "",
            "categoryId": event.categoryId ?? "",
            "categoryName": event.categoryName ?? "",
        ]
        if let timer = event.timer, let data = try? JSONEncoder().encode(timer),
           let json = String(data: data, encoding: .utf8) {
            info["timer"] = json
        }
        return info
    }

    nonisolated static func event(in userInfo: [AnyHashable: Any]) -> NextEvent? {
        guard let id = userInfo["eventId"] as? String,
              let calendarId = userInfo["calendarId"] as? String,
              let start = (userInfo["start"] as? String).flatMap(ISO8601.date(from:)),
              let end = (userInfo["end"] as? String).flatMap(ISO8601.date(from:)),
              let categoryId = userInfo["categoryId"] as? String, !categoryId.isEmpty
        else { return nil }
        let timer = (userInfo["timer"] as? String)
            .flatMap { $0.data(using: .utf8) }
            .flatMap { try? JSONDecoder().decode(EventTimer.self, from: $0) }
        let blank = { (value: Any?) -> String? in
            guard let string = value as? String, !string.isEmpty else { return nil }
            return string
        }
        return NextEvent(
            id: id,
            calendarId: calendarId,
            title: userInfo["title"] as? String ?? "",
            start: start,
            end: end,
            inProgress: start <= Date(),
            categoryId: categoryId,
            categoryName: blank(userInfo["categoryName"]),
            categoryColor: blank(userInfo["color"]),
            categoryIcon: blank(userInfo["icon"]),
            timer: timer
        )
    }

    /// The categories this app files notifications under, with the one button any of them has.
    /// Registering replaces the whole set, so the button-less ones are named too — a reminder from
    /// the phone lands in `categoryID` and still wants the custom scene.
    private static var registered = false
    private static func registerCategoriesOnce() {
        guard !registered else { return }
        registered = true
        let start = UNNotificationAction(
            identifier: startActionID, title: "Start timer", options: [.foreground]
        )
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: categoryID, actions: [], intentIdentifiers: []),
            UNNotificationCategory(identifier: joinCategoryID, actions: [], intentIdentifiers: []),
            UNNotificationCategory(identifier: startCategoryID, actions: [start], intentIdentifiers: []),
        ])
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
