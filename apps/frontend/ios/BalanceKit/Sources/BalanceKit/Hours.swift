import Foundation

/// How a number of hours is written on an Apple screen: whole hours stay whole, anything else keeps
/// one decimal. "12h" reads as a fact and "12.0h" reads as a measurement, and on a wrist the extra
/// character is a real cost.
///
/// Like ``Color/init(hex:)``, this is here rather than private to each view because the watch app
/// and the widget must not round the same week differently.
public func hoursText(_ value: Double) -> String {
    value.rounded() == value ? String(format: "%.0f", value) : String(format: "%.1f", value)
}

/// A span written the way the menu bar writes it — "45m", "1h 5m", "2h" — so the wrist and the Mac
/// never phrase the same wait two different ways. Seconds are deliberately absent: a countdown that
/// ticks every second on a watch face is noise, and rounds to the minute the eye reads anyway.
public func durationText(_ seconds: TimeInterval) -> String {
    let minutes = Int((max(seconds, 0) / 60).rounded())
    let (h, m) = (minutes / 60, minutes % 60)
    if h <= 0 { return "\(m)m" }
    if m == 0 { return "\(h)h" }
    return "\(h)h \(m)m"
}
