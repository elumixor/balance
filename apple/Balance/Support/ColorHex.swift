import SwiftUI

extension Color {
    /// Parses a "#RRGGBB" or "RRGGBB" hex string. Falls back to gray if malformed.
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }

        var value: UInt64 = 0
        guard s.count == 6, Scanner(string: s).scanHexInt64(&value) else {
            self = .gray
            return
        }

        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self = Color(red: r, green: g, blue: b)
    }

    /// Serializes to "#RRGGBB" using the sRGB color space.
    var hexString: String {
        let resolved = resolve(in: .init())
        let r = Int((resolved.red * 255).rounded())
        let g = Int((resolved.green * 255).rounded())
        let b = Int((resolved.blue * 255).rounded())
        return String(format: "#%02X%02X%02X", r, g, b)
    }
}
