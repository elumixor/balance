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
