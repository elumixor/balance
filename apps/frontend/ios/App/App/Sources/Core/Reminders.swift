import BalanceKit
import Foundation
import UIKit
import UserNotifications

/// Event reminders, worked out ahead and handed to the system.
///
/// The phone is asleep when a reminder is due, so the next two days are planned whenever the
/// calendar or the preferences move and the whole list replaces what was pending. The rule is the
/// web app's (`$lib/calendar/reminders.ts`): the event's own shortest popup reminder when the
/// account uses calendar reminders, the account's lead time otherwise, and one more a minute
/// before a call starts. The payload carries the sphere's colour and glyph flat in `userInfo`,
/// which is what the watch draws a mirrored reminder with (`EventNotificationView.swift`).
@MainActor
final class Reminders: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Reminders()

    static let category = "balance.event"
    static let joinCategory = "balance.event.join"
    static let joinAction = "join"
    private static let prefix = "balance.event."
    private static let horizon: TimeInterval = 48 * 3600
    private static let maxPending = 48

    /// Where a tapped reminder asks to be taken: the event's key.
    var onOpen: ((String) -> Void)?
    /// A tapped sitting reminder, with its slot.
    var onSession: ((String) -> Void)?
    static let sessionCategory = "balance.session"
    private static let sessionPrefix = "balance.session."

    /// The next two days' sitting reminders, words and all, exactly as the server wrote them —
    /// the phone is asleep when they fire, so nothing about them is decided then.
    func rescheduleSessions(enabled: Bool, slots: [SessionSlot], sound: Bool) async {
        guard await ensureAuthorized() else { return }
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.sessionPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        guard enabled else { return }
        for slot in slots where slot.at.timeIntervalSinceNow > 5 {
            let content = UNMutableNotificationContent()
            content.title = slot.title
            content.body = slot.body
            content.categoryIdentifier = Self.sessionCategory
            content.sound = sound ? .default : nil
            content.userInfo = ["sessionSlot": slot.slot, "day": slot.day, "icon": "sunrise", "color": ""]
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: slot.at)
            try? await center.add(UNNotificationRequest(
                identifier: "\(Self.sessionPrefix)\(slot.slot).\(slot.day)", content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            ))
        }
    }
    private var authorized: Bool?

    func install() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let join = UNNotificationAction(identifier: Self.joinAction, title: "Join", options: [.foreground])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: Self.category, actions: [], intentIdentifiers: []),
            UNNotificationCategory(identifier: Self.joinCategory, actions: [join], intentIdentifiers: []),
            UNNotificationCategory(identifier: Self.sessionCategory, actions: [], intentIdentifiers: []),
        ])
    }

    private func ensureAuthorized() async -> Bool {
        if let authorized { return authorized }
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        let granted: Bool
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: granted = true
        case .notDetermined: granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        default: granted = false
        }
        authorized = granted
        return granted
    }

    struct Planned: Equatable {
        let id: String
        let at: Date
        let title: String
        let body: String
        let join: String?
        let eventKey: String
        let color: String
        let icon: String
        let kind: String
    }

    /// The reminders due in the next two days, soonest first.
    static func plan(events: [CalendarEvent], spheres: [String: Sphere], prefs: ReminderPreferences, now: Date) -> [Planned] {
        guard prefs.enabled else { return [] }
        let clock = DateFormatter()
        clock.timeStyle = .short
        clock.dateStyle = .none
        var planned: [Planned] = []
        for event in events where !event.allDay && !event.declined && event.start > now && event.start <= now.addingTimeInterval(horizon) {
            let sphere = event.sphere(in: spheres)
            let own = prefs.useCalendarReminders ? event.reminders.filter { $0.method == "popup" }.map(\.minutes).min() : nil
            let lead = own ?? prefs.leadMinutes
            let title = event.title.trimmingCharacters(in: .whitespaces).isEmpty ? "Untitled" : event.title
            func add(_ kind: String, _ at: Date, _ body: String) {
                guard at.timeIntervalSince(now) > 5 else { return }
                planned.append(Planned(
                    id: "\(prefix)\(event.key).\(kind)", at: at, title: title, body: body, join: event.conferenceUrl,
                    eventKey: event.key, color: sphere?.color ?? "#8A9097", icon: sphere?.icon ?? "circle", kind: kind
                ))
            }
            add("starts", event.start.addingTimeInterval(-Double(lead) * 60), "Starts at \(clock.string(from: event.start))")
            if event.conferenceUrl != nil {
                add("join", event.start.addingTimeInterval(-60), "Starting now — \(clock.string(from: event.start))")
            }
        }
        return Array(planned.sorted { $0.at < $1.at }.prefix(maxPending))
    }

    /// Replaces every pending event reminder with the plan for the next two days.
    func reschedule(events: [CalendarEvent], spheres: [String: Sphere], prefs: ReminderPreferences) async {
        guard await ensureAuthorized() else { return }
        let center = UNUserNotificationCenter.current()
        let plan = Self.plan(events: events, spheres: spheres, prefs: prefs, now: Date())
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
        let keep = Set(plan.map(\.id))
        center.removePendingNotificationRequests(withIdentifiers: pending.filter { !keep.contains($0) })
        for item in plan {
            let content = UNMutableNotificationContent()
            content.title = item.title
            content.body = item.body
            content.categoryIdentifier = item.join == nil ? Self.category : Self.joinCategory
            content.sound = prefs.sound ? .default : nil
            content.userInfo = [
                "eventId": item.eventKey, "kind": item.kind, "joinUrl": item.join ?? "", "color": item.color, "icon": item.icon,
            ]
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: item.at)
            let request = UNNotificationRequest(
                identifier: item.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            )
            try? await center.add(request)
        }
    }

    func clear() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let join = info["joinUrl"] as? String ?? ""
        let key = info["eventId"] as? String
        let sessionSlot = info["sessionSlot"] as? String
        await MainActor.run {
            if let sessionSlot {
                onSession?(sessionSlot)
            } else if response.actionIdentifier == Self.joinAction, let url = URL(string: join), !join.isEmpty {
                UIApplication.shared.open(url)
            } else if let key {
                onOpen?(key)
            }
        }
    }
}
