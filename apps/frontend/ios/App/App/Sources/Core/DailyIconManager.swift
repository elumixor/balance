import UIKit

/// Switches the home-screen icon to the one matching today's date.
///
/// The Mac paints its Dock icon live (`src/lib/desktop/dock.ts`); the phone can't — iOS only lets
/// an app swap between icons it shipped, via `setAlternateIconName`. `scripts/daily-icons.ts`
/// bakes the 31 day-of-month variants named `AppIcon-DayNN`, and this only ever picks among them.
enum DailyIconManager {
    /// Idempotent — the system already no-ops a repeat request, this just skips asking.
    private static var lastApplied: Int?

    static func applyForToday() {
        let day = Calendar.current.component(.day, from: Date())
        guard day != lastApplied else { return }
        let name = String(format: "AppIcon-Day%02d", day)
        UIApplication.shared.setAlternateIconName(name) { error in
            if let error {
                print("DailyIconManager: couldn't switch to \(name): \(error)")
            } else {
                lastApplied = day
            }
        }
    }
}
