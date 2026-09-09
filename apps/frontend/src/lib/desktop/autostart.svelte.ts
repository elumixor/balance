import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./platform";
import { report } from "./report";

/**
 * Whether the Mac app opens at login — and comes back if it dies.
 *
 * The menu bar, the Dock icon and the reminders only exist while the app is running, so the shell
 * registers itself as a `launchd` agent on every launch (`src-tauri/src/login_item.rs`): an app
 * somebody has to remember to open is one that isn't there when it matters. This is the switch in
 * settings that turns that off, and reads what is registered rather than what was chosen.
 */
class DesktopAutostart {
  enabled = $state<boolean | null>(null);

  /** Asks the system rather than trusting a stored answer: System Settings can change it too. */
  async load() {
    if (!isDesktop) return;
    try {
      this.enabled = await invoke<boolean>("login_item_enabled");
    } catch (e) {
      report("Couldn't tell whether Balance opens at login", e);
    }
  }

  async set(enabled: boolean) {
    if (!isDesktop) return;
    const before = this.enabled;
    this.enabled = enabled;
    try {
      await invoke("set_login_item", { enabled });
    } catch (e) {
      this.enabled = before;
      report("Couldn't change whether Balance opens at login", e);
    }
  }
}

export const desktopAutostart = new DesktopAutostart();
