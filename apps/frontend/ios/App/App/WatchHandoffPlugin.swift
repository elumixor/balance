import Capacitor
import Foundation
import WatchConnectivity

/// Capacitor only auto-registers the plugins listed in `capacitor.config.json`, and that list is
/// rewritten from the installed npm packages every time `cap sync` runs — a plugin that lives in
/// this app rather than in a package would be dropped from it. Registering the instance here is
/// how such a plugin is kept: the bridge asks its view controller once it has loaded, and nothing
/// generated can forget about it.
class BalanceBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WatchHandoffPlugin())
        bridge?.registerPluginInstance(IcsImportPlugin())
    }
}

/// The one native thing the phone app does for the watch: carry a sign-in ticket across.
///
/// Clerk lives in the webview here — this app has no native session for Clerk's own watch sync to
/// copy — so the handover is ours to make. The web layer mints a ticket from the API and hands it
/// down; this pushes it over as Watch Connectivity's application context, which is the delivery
/// that survives the watch app being closed: the system holds the latest one and gives it to the
/// watch the moment it next runs.
///
/// The watch can also ask, by message, when it starts without a session. Nothing native can answer
/// that on its own, so the question is passed up to the webview, which mints a fresh ticket and
/// comes back through `setTicket`.
@objc(WatchHandoffPlugin)
public class WatchHandoffPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "WatchHandoffPlugin"
    public let jsName = "WatchHandoff"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTicket", returnType: CAPPluginReturnPromise),
    ]

    /// The event the webview listens for: a watch that has started up wanting a session.
    private static let ticketRequested = "ticketRequested"

    private var session: WCSession? {
        WCSession.isSupported() ? WCSession.default : nil
    }

    override public func load() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    /// Whether there is a watch with the app on it to hand anything to. The webview asks first so
    /// that a phone without a watch never mints tickets nobody redeems.
    @objc func isAvailable(_ call: CAPPluginCall) {
        guard let session, session.activationState == .activated else {
            return call.resolve(["available": false])
        }
        call.resolve(["available": session.isPaired && session.isWatchAppInstalled])
    }

    @objc func setTicket(_ call: CAPPluginCall) {
        guard let ticket = call.getString("ticket"), !ticket.isEmpty else {
            return call.reject("A ticket is required")
        }
        guard let session, session.activationState == .activated else {
            return call.reject("Watch Connectivity isn't available")
        }

        do {
            // `issuedAt` is what makes two pushes of the same ticket different application
            // contexts; without it the system drops the second as a duplicate, and a watch that
            // failed to redeem the first would never see another.
            try session.updateApplicationContext([
                "ticket": ticket,
                "issuedAt": Date().timeIntervalSince1970,
            ])
            call.resolve()
        } catch {
            call.reject("Couldn't reach the watch: \(error.localizedDescription)")
        }
    }

    // MARK: WCSessionDelegate

    public func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    /// A watch that was unpaired and paired again is a different watch: the session restarts, and
    /// whatever context the old one was holding is gone, so the next push has to be a fresh one.
    public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard message["request"] as? String == "ticket" else { return }
        notifyListeners(Self.ticketRequested, data: [:])
    }
}
