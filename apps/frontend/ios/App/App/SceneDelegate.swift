import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // Not Capacitor's own controller: the subclass is what registers this app's watch plugin.
        window?.rootViewController = BalanceBridgeViewController()
        window?.makeKeyAndVisible()

        // A shared calendar file is usually what launched the app, and those URLs arrive here
        // rather than through `openURLContexts` — the plugin holds them until the webview asks.
        handleIcsFiles(in: connectionOptions.urlContexts)
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        handleIcsFiles(in: URLContexts)
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    /// Calendar files are taken here; everything else — the Google sign-in callback above all —
    /// is left untouched for Capacitor and its plugins to handle as they always have.
    private func handleIcsFiles(in contexts: Set<UIOpenURLContext>) {
        for context in contexts {
            IcsImportPlugin.handle(url: context.url)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
