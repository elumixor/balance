import SwiftUI

extension Color {
    /// Builds a colour from the `#rrggbb` strings the backend stores on a category.
    ///
    /// Categories carry their colour as hex because that is what the web app renders, and both the
    /// watch app and the widget need the same answer from the same string — so the conversion lives
    /// here rather than being redefined privately in each target. Anything unparseable falls back to
    /// grey, which is visible and obviously wrong, rather than to a colour that looks deliberate.
    public init(hex: String) {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }

        // The three-digit form is shorthand for the six-digit one with every nibble doubled.
        if value.count == 3 {
            value = value.map { "\($0)\($0)" }.joined()
        }

        guard value.count == 6, let rgb = UInt32(value, radix: 16) else {
            self = .gray
            return
        }

        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}
