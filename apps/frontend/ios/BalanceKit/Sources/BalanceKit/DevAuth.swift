import Foundation

/// Signing in as `DEV_AUTH_EMAIL` without signing in, for a simulator.
///
/// The watch has no sign-in of its own — it waits for a ticket the phone pushes across, which on a
/// simulator with no paired phone never comes. So running the watch app used to mean either sample
/// data or nothing at all, and neither answers the question the simulator is for: does this screen
/// draw *my* week?
///
/// With `BALANCE_DEV_AUTH=1` in its environment the app skips Clerk entirely and talks to a local
/// backend, which is running the same bypass and answers every request as that account. Both halves
/// are fenced: the flag only ever reaches the app through `simctl`, and the backend ignores its own
/// half in production and on Vercel — so a build that somehow carried this would still be refused
/// by the only side that matters.
public enum DevAuth {
    public static let isEnabled = ProcessInfo.processInfo.environment["BALANCE_DEV_AUTH"] == "1"

    /// Where the local backend is. A simulator shares the Mac's network stack, so `localhost` is
    /// the Mac — the same address the web app's dev server uses.
    public static var apiBaseURL: URL? {
        guard isEnabled else { return nil }
        let declared = ProcessInfo.processInfo.environment["BALANCE_DEV_API_URL"]
        return URL(string: declared ?? "http://localhost:3100")
    }

    /// What goes in the `Authorization` header. The backend isn't reading it while the bypass is
    /// on, only checking that a request looks like one an app would make.
    public static let token = "dev"
}
