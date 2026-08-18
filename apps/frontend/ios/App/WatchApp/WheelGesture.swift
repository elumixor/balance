import SwiftUI
import WatchKit
import BalanceKit

/// The press-and-drag that picks a category off the ring.
///
/// The gesture is deliberately origin-relative rather than centre-relative: the finger lands
/// wherever it lands on a small screen, and the direction that matters is the one it travelled from
/// that first touch. Everything before the finger has moved past the dead zone is "pressing but
/// undecided", which is what lets the ring appear under the thumb without immediately committing to
/// whichever segment happens to be under it.
///
/// The view attaches the gesture and forwards it here; this model owns no drawing and no
/// networking, only which segment the current direction lands on.
@MainActor
@Observable
final class WheelGestureModel {
    /// The categories the ring is showing. Kept in sync by the root view; changing them while a
    /// press is in flight re-resolves the selection against the new layout rather than keeping a
    /// stale index.
    var categories: [WatchCategory] {
        didSet {
            guard categories != oldValue else { return }
            layout = WheelLayout(categories: categories)
            if isPressing { resolve(silently: true) } else { focusedIndex = nil }
        }
    }

    /// A finger is down. The ring is visible from this moment, even with nothing focused yet.
    private(set) var isPressing = false

    /// The segment the current direction lands on, or nil while the finger is still inside the
    /// dead zone. The wheel renders its focus transform from exactly this.
    private(set) var focusedIndex: Int?

    /// The finger's offset from where the press began, in the wheel's own coordinate space. Its
    /// length decides whether the press has left the dead zone and its direction decides which
    /// segment is focused — and the wheel slides against it, so it is public as well.
    private(set) var pan: CGSize = .zero

    /// How far the finger has to travel before the wheel commits to a direction. Short enough that
    /// a deliberate flick selects at once, long enough that a plain tap selects nothing.
    static let deadZone: CGFloat = 14

    private var layout: WheelLayout
    private var origin: CGPoint = .zero

    /// Where the finger currently is, in the coordinate space the drag gesture reports — nil while
    /// nothing is pressed. The readout that follows the finger is positioned from this.
    var location: CGPoint? {
        guard isPressing else { return nil }
        return CGPoint(x: origin.x + pan.width, y: origin.y + pan.height)
    }

    init(categories: [WatchCategory] = []) {
        self.categories = categories
        self.layout = WheelLayout(categories: categories)
    }

    var focusedCategory: WatchCategory? {
        focusedIndex.flatMap { layout.segment(at: $0)?.category }
    }

    // MARK: - Gesture input

    /// The finger went down at `point`, in the coordinate space the drag gesture reports.
    func began(at point: CGPoint) {
        origin = point
        isPressing = true
        pan = .zero
        focusedIndex = nil
        WKInterfaceDevice.current().play(.start)
    }

    /// The finger moved to `point`. A press that somehow never began is treated as beginning here,
    /// so a gesture recogniser that swallows the first callback cannot leave the model inert.
    func moved(to point: CGPoint) {
        guard isPressing else {
            began(at: point)
            return
        }
        pan = CGSize(width: point.x - origin.x, height: point.y - origin.y)
        resolve(silently: false)
    }

    /// The finger lifted. Returns the category to act on, or nil when the drag never left the dead
    /// zone — a plain tap means "never mind". The model is idle again either way.
    @discardableResult
    func ended() -> WatchCategory? {
        let picked = focusedCategory
        reset()
        if picked != nil { WKInterfaceDevice.current().play(.success) }
        return picked
    }

    /// Abandons the gesture without choosing anything — used when a sheet takes over the screen or
    /// the data underneath disappears mid-press.
    func cancel() {
        guard isPressing else { return }
        reset()
    }

    // MARK: - Resolving

    /// Turns the current drag vector into a focused segment. `silently` skips the haptic, which is
    /// what a layout change wants: the finger did not move, so nothing was "selected".
    private func resolve(silently: Bool) {
        let previous = focusedIndex
        let travel = hypot(pan.width, pan.height)

        if travel < Self.deadZone || layout.isEmpty {
            focusedIndex = nil
        } else {
            focusedIndex = layout.index(at: direction)
        }

        if focusedIndex != previous, focusedIndex != nil, !silently {
            WKInterfaceDevice.current().play(.click)
        }
    }

    /// The drag's direction, measured clockwise from twelve o'clock so it lines up with the angles
    /// the ring is drawn from. Screen coordinates run downward, hence the negated height.
    private var direction: Angle {
        Angle.radians(atan2(Double(pan.width), Double(-pan.height))).normalizedTurn
    }

    private func reset() {
        isPressing = false
        focusedIndex = nil
        pan = .zero
    }
}
