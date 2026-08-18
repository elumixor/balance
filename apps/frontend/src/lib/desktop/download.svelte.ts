import { isNativeShell } from "./platform";

/** What the deployment says it is handing out — written next to the DMG by scripts/deploy-desktop.ts. */
interface DesktopBuild {
  version: string;
  bytes: number;
  builtAt: string;
  arch: string;
  /** Whether Apple has notarized this build — if not, the first launch needs a trip to settings. */
  notarized: boolean;
}

export const DESKTOP_DOWNLOAD_URL = "/download/Balance.dmg";

/**
 * The macOS app, as an offer the website can make.
 *
 * A deployment only carries the DMG if the release that made it built one, and a dev server never
 * does, so the button is drawn from what the server actually has rather than from a hardcoded
 * link that might 404. Asked for once per session, like everything else on screen.
 */
class DesktopDownload {
  build = $state<DesktopBuild | null>(null);
  private asked = false;

  async ensure() {
    if (this.asked || isNativeShell) return;
    this.asked = true;
    try {
      const response = await fetch("/download/desktop.json");
      // The SPA answers unknown paths with its own shell, so a missing file is a 200 of HTML.
      if (response.ok) this.build = (await response.json()) as DesktopBuild;
    } catch {
      // No download on this deployment. The section simply isn't drawn.
    }
  }

  get size() {
    if (!this.build) return "";
    return `${(this.build.bytes / 1e6).toFixed(0)} MB`;
  }
}

export const desktopDownload = new DesktopDownload();
