import AuthenticationServices
import BalanceKit
import BalanceTelemetry
import ClerkKit
import GoogleSignIn
import SwiftUI

/// Who is signed in, and the three ways the app can be started.
///
/// A real launch holds a native Clerk session, which ClerkKit keeps in the keychain and refreshes
/// itself — so the sign-in screen is seen once, not on every launch the way the webview's was.
/// Signing in is a provider's native sheet (Apple's or Google's), whose identity token the API
/// trades for a Clerk sign-in ticket; that is the same bridge the old shell used, and the one the
/// Clerk development instance is known to accept.
///
/// `BALANCE_DEV_AUTH=1` skips all of it against a local backend running as `DEV_AUTH_EMAIL`, and
/// `-fixtures` skips the network as well, for the smoke tests.
@MainActor
@Observable
final class Session {
    enum Mode { case live, devAuth, fixtures }
    enum State: Equatable { case loading, signedOut, signedIn }

    let mode: Mode
    private(set) var busy = false
    var error: String?
    /// Set once a live launch has a Clerk session, so the store is built for exactly one account.
    private(set) var store: Store?

    static let productionAPI = URL(string: "https://balance-app-mauve.vercel.app")!

    static var apiBaseURL: URL {
        if let dev = DevAuth.apiBaseURL { return dev }
        // The release lane writes the address a build is for — the dev deployment for a develop
        // build — into the plist, the way the web bundle used to have it baked in.
        if let declared = Bundle.main.object(forInfoDictionaryKey: "BalanceAPIBaseURL") as? String,
           let url = URL(string: declared), url.scheme == "https" || url.host == "localhost" {
            return url
        }
        return productionAPI
    }

    init() {
        if ProcessInfo.processInfo.arguments.contains("-fixtures") {
            mode = .fixtures
        } else if DevAuth.isEnabled {
            mode = .devAuth
        } else {
            mode = .live
            configureClerk()
        }
        switch mode {
        case .fixtures: store = Store(backend: FixtureBackend())
        case .devAuth: store = Store(backend: LiveBackend(baseURL: Self.apiBaseURL) { DevAuth.token })
        case .live: break
        }
    }

    var state: State {
        switch mode {
        case .fixtures, .devAuth: return .signedIn
        case .live:
            if Clerk.shared.session != nil { return .signedIn }
            return Clerk.shared.isLoaded ? .signedOut : .loading
        }
    }

    /// Builds the store the first time a live session is seen.
    func sessionChanged() {
        guard mode == .live else { return }
        if Clerk.shared.session != nil, store == nil {
            store = Store(backend: liveBackend)
            if let id = Clerk.shared.user?.id { Telemetry.identify(userID: id) }
        } else if Clerk.shared.session == nil, Clerk.shared.isLoaded, let store {
            store.wipe()
            self.store = nil
        }
    }

    @ObservationIgnored private let liveBackend = LiveBackend(baseURL: Session.apiBaseURL) {
        try await Clerk.shared.session?.getToken()
    }

    // MARK: Signing in

    func signInWithApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            self.error = error.localizedDescription
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let data = credential.identityToken, let token = String(data: data, encoding: .utf8)
            else {
                error = "Apple didn't hand over an identity."
                return
            }
            await redeem(provider: "apple", idToken: token)
        }
    }

    func signInWithGoogle() async {
        guard let root = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow?.rootViewController }).first else { return }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: root.topmost)
            guard let token = result.user.idToken?.tokenString else {
                error = "Google didn't hand over an identity."
                return
            }
            await redeem(provider: "google", idToken: token)
        } catch {
            if (error as NSError).code == GIDSignInError.canceled.rawValue { return }
            self.error = error.localizedDescription
        }
    }

    private func redeem(provider: String, idToken: String) async {
        busy = true
        defer { busy = false }
        do {
            let ticket = try await liveBackend.nativeTicket(provider: provider, idToken: idToken)
            try await Clerk.shared.auth.signInWithTicket(ticket)
            error = nil
            sessionChanged()
            Telemetry.event("signed_in", ["provider": provider])
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func signOut() async {
        guard mode == .live else { return }
        try? await Clerk.shared.auth.signOut()
        GIDSignIn.sharedInstance.signOut()
        Telemetry.forget()
        sessionChanged()
    }
}

extension UIViewController {
    /// Whatever is presented on top, which is what a provider's sheet has to be presented from.
    var topmost: UIViewController { presentedViewController?.topmost ?? self }
}
