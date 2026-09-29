import Foundation
import WatchConnectivity

/// Carries a sign-in ticket to the watch, which has no sign-in of its own.
///
/// The phone mints a short-lived ticket from the API and leaves it as Watch Connectivity's
/// application context — the delivery the system holds while the watch app is closed and hands
/// over the moment it runs. The watch redeems it once into a Clerk session of its own
/// (`WatchPairing.swift`), and asks by message when it starts without one.
@MainActor
final class WatchLink: NSObject, WCSessionDelegate {
    static let shared = WatchLink()

    /// Mints a ticket; set once there is a signed-in store to ask.
    var mint: (() async throws -> String)?
    private var lastPushed: Date?

    private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

    func activate() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    /// Hands a fresh ticket over when there is a watch with the app on it, at most once an hour —
    /// a ticket lives an hour, and a watch that already redeemed one never needs another.
    func push(force: Bool = false) {
        guard let session, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled,
              let mint else { return }
        if !force, let lastPushed, Date().timeIntervalSince(lastPushed) < 3600 { return }
        Task {
            guard let ticket = try? await mint() else { return }
            // `issuedAt` makes two pushes of equal tickets different contexts, or the second is dropped.
            try? session.updateApplicationContext(["ticket": ticket, "issuedAt": Date().timeIntervalSince1970])
            lastPushed = Date()
        }
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.push() }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    /// A watch unpaired and paired again is a new watch; the session restarts for it.
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard message["request"] as? String == "ticket" else { return }
        Task { @MainActor in self.push(force: true) }
    }
}
