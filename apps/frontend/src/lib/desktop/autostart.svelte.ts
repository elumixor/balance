import { isDesktop } from "./platform";
import { report } from "./report";

/**
 * Whether the Mac app opens at login.
 *
 * The shell registers itself once, on its first launch (`register_autostart_once` in
 * `src-tauri/src/lib.rs`), because the menu bar and the reminders only exist while the app is
 * running — and an app somebody has to remember to open is one that isn't. This is the switch
 * in settings that turns that back off, and reads what the system currently says.
 */
class DesktopAutostart {
  enabled = $state<boolean | null>(null);

  /** Asks the system rather than trusting a stored answer: System Settings can change it too. */
  async load() {
    if (!isDesktop) return;
    try {
      const { isEnabled } = await import("@tauri-apps/plugin-autostart");
      this.enabled = await isEnabled();
    } catch (e) {
      report("Couldn't tell whether Balance opens at login", e);
    }
  }

  async set(enabled: boolean) {
    if (!isDesktop) return;
    const before = this.enabled;
    this.enabled = enabled;
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      await (enabled ? enable() : disable());
    } catch (e) {
      this.enabled = before;
      report("Couldn't change whether Balance opens at login", e);
    }
  }
}

export const desktopAutostart = new DesktopAutostart();
