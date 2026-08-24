import BalanceKit
import SwiftUI
import UserNotifications
import WatchKit

/// How a reminder looks on the wrist.
///
/// Reminders are scheduled on the iPhone (`src/lib/mobile/reminders.svelte.ts`) and, when there is
/// no iPhone, here (`EventAlarm`). Either way they arrive in the `balance.event` category, and this
/// is the view watchOS draws for it instead of the default title-and-body card — so a reminder
/// wears the colour and the glyph of whatever the event counts as, the same as the block on the
/// week and the line at the bottom of the tracking screen.
///
/// Everything drawn here travels in the notification: a watch showing a forwarded reminder may
/// have no session of its own, and a card that had to fetch anything would be a blank card.
struct EventNotificationView: View {
    let title: String
    /// The line under the title — "Starts at 14:00", "Time to leave for 14:00".
    let subtitle: String
    let color: Color
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 14))
                    .foregroundStyle(color)
                Text(title)
                    .font(.headline)
                    .lineLimit(2)
            }
            Text(subtitle)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The hosting controller watchOS hands the delivered notification to. It reads what the phone —
/// or `EventAlarm` — put in `userInfo`, and falls back to the notification's own text and to the
/// default glyph, because a reminder that arrives from an older build still has to be shown.
final class EventNotificationController: WKUserNotificationHostingController<EventNotificationView> {
    private var title = ""
    private var message = ""
    private var color = Color.accentColor
    private var symbol = Icons.fallback

    override var body: EventNotificationView {
        EventNotificationView(title: title, subtitle: message, color: color, symbol: symbol)
    }

    override func didReceive(_ notification: UNNotification) {
        let content = notification.request.content
        title = content.title.isEmpty ? "Balance" : content.title
        message = content.body

        // Scheduled here, the payload is `userInfo` itself; scheduled on the phone, Capacitor's
        // plugin nests whatever was passed as `extra` under `cap_extra`. Both spellings are read,
        // because the same card draws a reminder from either side.
        let info = content.userInfo["cap_extra"] as? [AnyHashable: Any] ?? content.userInfo
        let hex = info["color"] as? String ?? ""
        color = hex.isEmpty ? .accentColor : Color(hex: hex)
        symbol = Icons.symbol(for: info["icon"] as? String)
    }
}
