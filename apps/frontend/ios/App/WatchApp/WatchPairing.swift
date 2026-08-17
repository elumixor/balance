import ClerkKit
import Foundation
import WatchConnectivity

/// How the watch gets a session.
///
/// Clerk's own phone-to-watch sync copies a *native* session, and the phone app hasn't got one:
/// it is a web app in a webview, and its session lives in Clerk's JavaScript SDK. So the phone
/// mints a sign-in ticket instead and pushes it here as Watch Connectivity's application context —
/// the delivery that keeps the latest value while this app isn't running and hands it over the
/// moment it is.
///
/// Redeeming a ticket gives this app a Clerk session of its own, which from then on refreshes
/// itself and outlives the phone being nearby. That is why a ticket is only ever redeemed when
/// there is no session: a second redemption would replace a working session with an identical one
/// and, if it failed, leave the watch signed out for no reason.
@MainActor
@Observable
final class WatchPairing: NSObject, WCSessionDelegate {
    /// True while a ticket is being redeemed, so the root view can say "signing in" rather than
    /// flashing the "open Balance on your phone" card at somebody who is doing exactly that.
    private(set) var isPairing = false

    /// The most recent ticket that arrived while this app was busy or already signed in. Held so
    /// that losing a session — an expiry, a sign-out on the phone — can be answered without
    /// waiting for the phone to be opened again.
    private var pendingTicket: String?

    private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

    override init() {
        super.init()
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    /// Called when the watch app appears and whenever it finds itself without a session: redeems
    /// whatever the phone has already left waiting, and otherwise asks for something to redeem.
    func ensureSession() {
        guard Clerk.shared.session == nil, !isPairing else { return }

        if let ticket = pendingTicket ?? ticketFromContext() {
            Task { await redeem(ticket) }
            return
        }
        requestTicket()
    }

    /// A message rather than a context update: this is a question, and it can wake the phone app
    /// long enough for its webview to mint an answer, which comes back as a new context.
    private func requestTicket() {
        guard let session, session.activationState == .activated, session.isReachable else { return }
        session.sendMessage(["request": "ticket"], replyHandler: nil, errorHandler: nil)
    }

    private func ticketFromContext() -> String? {
        session?.receivedApplicationContext["ticket"] as? String
    }

    private func redeem(_ ticket: String) async {
        isPairing = true
        defer { isPairing = false }
        do {
            try await Clerk.shared.auth.signInWithTicket(ticket)
            pendingTicket = nil
        } catch {
            // A ticket expires in an hour and is single-use, so a failure here usually means this
            // one was already spent. Dropping it and asking again is the whole recovery.
            pendingTicket = nil
            requestTicket()
        }
    }

    // MARK: WCSessionDelegate

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith state: WCSessionActivationState,
        error: Error?
    ) {
        Task { @MainActor in self.ensureSession() }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        guard let ticket = context["ticket"] as? String else { return }
        Task { @MainActor in
            self.pendingTicket = ticket
            self.ensureSession()
        }
    }
}
