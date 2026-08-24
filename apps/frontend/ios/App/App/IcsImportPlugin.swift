import Capacitor
import Foundation

/// The phone half of importing an `.ics` file: iOS hands one over, this reads it and gives the
/// text to the webview.
///
/// The app declares the calendar file types in `Info.plist`, which is what puts Balance in the
/// share sheet and in "Open in" for an invitation in Mail or a timetable downloaded in Safari.
/// iOS then opens the app with a file URL, and the URL is all this deals in — deciding what the
/// file means, and writing any of it to a calendar, belongs to `ics-import.svelte.ts`, where the
/// Clerk session is.
///
/// A shared file usually launches the app rather than arriving in a running one, so what comes in
/// before the webview is listening is held here. `pending()` is how the web layer collects it once
/// it is; nothing is dropped for being early.
@objc(IcsImportPlugin)
public class IcsImportPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IcsImportPlugin"
    public let jsName = "IcsImport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise)
    ]

    /// The event the webview listens for: a file to look at.
    private static let received = "icsReceived"

    /// The one instance the bridge made, so the scene delegate can reach it. The scene has the
    /// URL and no way to ask Capacitor for a plugin by name.
    private static weak var current: IcsImportPlugin?

    /// Files that arrived before anything was listening, oldest first.
    private static var waiting: [[String: String]] = []
    private static let lock = NSLock()

    override public func load() {
        IcsImportPlugin.current = self
    }

    @objc func pending(_ call: CAPPluginCall) {
        IcsImportPlugin.lock.lock()
        let files = IcsImportPlugin.waiting
        IcsImportPlugin.waiting = []
        IcsImportPlugin.lock.unlock()
        call.resolve(["files": files])
    }

    /// Reads a file iOS has just handed the app. The URL is somebody else's — an attachment in
    /// Mail's container, a download in Files — so it is opened inside a security-scoped access and
    /// copied out as text right here; the URL itself is worth nothing by the time the webview asks.
    ///
    /// Returns whether the URL was a calendar file at all, so the scene delegate can leave
    /// everything else — an OAuth callback, a deep link — to the handlers that own it.
    @discardableResult
    static func handle(url: URL) -> Bool {
        guard url.isFileURL, url.pathExtension.lowercased() == "ics" else { return false }

        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        // Not every calendar file is UTF-8: an exporter that writes Latin-1 is rare but real, and
        // an event whose title has an accent in it is not a reason to refuse the whole file.
        guard let data = try? Data(contentsOf: url) else { return true }
        let content = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1)
        guard let content else { return true }

        let file = ["name": url.lastPathComponent, "content": content]
        if let plugin = current {
            // Retained until consumed: the plugin exists from the moment the webview loads, which
            // is well before the layout that listens has run, and a file dropped in that gap is
            // the whole reason the app was opened.
            plugin.notifyListeners(received, data: file, retainUntilConsumed: true)
        } else {
            lock.lock()
            waiting.append(file)
            lock.unlock()
        }
        return true
    }
}
