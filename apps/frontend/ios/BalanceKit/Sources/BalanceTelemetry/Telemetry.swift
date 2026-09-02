import Foundation
import PostHog
import Sentry

/// What the native halves of the app say about themselves when nobody is watching.
///
/// The web app has `diagnostics` and a banner along the top; the watch has a 40mm screen and no
/// console at all, and the phone's Swift shell runs before there is a webview to report into. Both
/// send here instead: Sentry keeps the crashes with their stacks, PostHog keeps what the wrist was
/// doing when they happened.
///
/// The keys live in the app's own `Info.plist` — a Sentry DSN and a PostHog project key are public
/// identifiers, shipped the same way the Clerk publishable key already is — and with neither set
/// this does nothing at all. A build without them is still a build somebody is wearing.
public enum Telemetry {
    /// The plist keys each target declares. Written by the release lane from the environment, so
    /// the phone, the watch and the widget can't drift onto different projects.
    public enum Key {
        public static let sentryDSN = "BalanceSentryDSN"
        public static let postHogKey = "BalancePostHogKey"
        public static let postHogHost = "BalancePostHogHost"
    }

    private static let defaultPostHogHost = "https://eu.i.posthog.com"
    private static var started = false

    /// Idempotent, and safe to call from an `App` initialiser — every target here has one entry
    /// point and all of them call this first.
    ///
    /// - Parameter platform: which of the Apple builds this is, since all of them report as the
    ///   same bundle otherwise: `"watchOS"`, `"watchOS-widget"`, `"iOS-shell"`.
    public static func start(platform: String) {
        guard !started else { return }
        started = true

        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "0"
        let build = info["CFBundleVersion"] as? String ?? "0"

        if let dsn = string(info, Key.sentryDSN) {
            SentrySDK.start { options in
                options.dsn = dsn
                options.releaseName = "balance@\(version)+\(build)"
                options.environment = isDebugBuild ? "development" : "production"
                // Crashes and errors, not traces. A watch is a small battery, and a sampled
                // transaction is radio time spent on a question nobody has asked.
                options.tracesSampleRate = 0
                options.sendDefaultPii = false
                options.enableAutoPerformanceTracing = false
            }
            SentrySDK.configureScope { scope in
                scope.setTag(value: platform, key: "platform")
            }
        }

        if let key = string(info, Key.postHogKey) {
            let host = string(info, Key.postHogHost) ?? defaultPostHogHost
            let config = PostHogConfig(projectToken: key, host: host)
            // Nothing here is a web page and nothing here is a tap worth guessing at: every event
            // this sends is one the app names on purpose.
            config.captureScreenViews = false
            config.captureApplicationLifecycleEvents = true
            PostHogSDK.shared.setup(config)
            PostHogSDK.shared.register(["platform": platform, "version": version, "build": build])
        }
    }

    /// Whose wrist this is, once the ticket from the phone has been redeemed.
    public static func identify(userID: String) {
        guard !userID.isEmpty else { return }
        SentrySDK.setUser(User(userId: userID))
        PostHogSDK.shared.identify(userID)
    }

    /// The session ended — the next one may belong to somebody else.
    public static func forget() {
        SentrySDK.setUser(nil)
        PostHogSDK.shared.reset()
    }

    /// A failure that had nowhere else to go. `context` is what the screen was doing at the time.
    public static func capture(_ error: Error, context: String? = nil) {
        SentrySDK.capture(error: error) { scope in
            if let context { scope.setTag(value: context, key: "scope") }
        }
        PostHogSDK.shared.capture(
            "app_error",
            properties: ["message": String(describing: error), "scope": context ?? "unknown"]
        )
    }

    /// Something the app did on purpose, for the count that says whether the ritual is working.
    public static func event(_ name: String, _ properties: [String: Any]? = nil) {
        PostHogSDK.shared.capture(name, properties: properties)
        let crumb = Breadcrumb(level: .info, category: "app")
        crumb.message = name
        crumb.data = properties
        SentrySDK.addBreadcrumb(crumb)
    }

    /// A plist value that is present and not the empty placeholder a build without keys ships.
    private static func string(_ info: [String: Any], _ key: String) -> String? {
        guard let value = info[key] as? String, !value.isEmpty else { return nil }
        return value
    }

    private static var isDebugBuild: Bool {
        #if DEBUG
            return true
        #else
            return false
        #endif
    }
}
