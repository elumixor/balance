import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { isDesktop } from "./platform";
import { report } from "./report";

/**
 * How often the app asks whether there is a newer one.
 *
 * A menu bar app is opened once and then left running for weeks, so "on launch" on its own would
 * mean an app that never updates. The check is one small request against the same deployment the
 * app already talks to all day.
 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** How long to wait before the first check, so a launch spends its network on the week first. */
const FIRST_CHECK_MS = 10_000;

/** Where an update is in its one-way trip from "there is one" to "restart to use it". */
type UpdateStage = "idle" | "checking" | "downloading" | "ready";

/**
 * The macOS app, keeping itself current.
 *
 * The website hands out a DMG, and until now that was the only way a new version ever reached a
 * Mac — which means the number of people running last month's build was everyone. The deploy that
 * stages the DMG stages a signed manifest beside it (`/download/latest.json`, see
 * `scripts/stage-updater.ts`), and this asks that manifest whether the bundle on disk is behind.
 *
 * Downloading and installing happens without asking: it replaces files the running app has
 * already loaded, which macOS is fine with, and nothing on screen changes until the app is
 * relaunched. Only the relaunch is offered — from the menu bar, where a hidden window can't hide
 * it, and from settings.
 */
class DesktopUpdates {
  stage = $state<UpdateStage>("idle");
  /** The version waiting on a restart, once one has been installed. */
  installed = $state<string | null>(null);
  /** 0–1 while downloading, for the settings row. Null when the server sends no length. */
  progress = $state<number | null>(null);

  #timer: ReturnType<typeof setInterval> | null = null;
  #first: ReturnType<typeof setTimeout> | null = null;

  /** Idempotent, and a no-op anywhere but the desktop build. */
  start() {
    if (!isDesktop || this.#timer) return;
    this.#first = setTimeout(() => void this.check(), FIRST_CHECK_MS);
    this.#timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.#first) clearTimeout(this.#first);
    if (this.#timer) clearInterval(this.#timer);
    this.#first = null;
    this.#timer = null;
  }

  /**
   * Ask, and install whatever comes back. Safe to call at any time — a check while one is already
   * running, or after an update is installed and only waiting on the restart, does nothing.
   */
  async check() {
    if (!isDesktop || this.stage !== "idle") return;
    this.stage = "checking";
    try {
      const update = await check();
      if (!update) {
        this.stage = "idle";
        return;
      }

      this.stage = "downloading";
      let total = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          this.progress = total ? 0 : null;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total) this.progress = Math.min(1, downloaded / total);
        }
      });

      this.installed = update.version;
      this.stage = "ready";
      // Nothing left to check for: the bundle on disk is already the new one, and asking again
      // would answer with the version this process is still running.
      this.stop();
    } catch (e) {
      // An update that can't be fetched is not something to interrupt anybody about — the app
      // keeps working, and the next check is in six hours.
      this.stage = "idle";
      this.progress = null;
      report("The update check failed", e);
    }
  }

  /** Quit and come back on the version just installed. */
  async restart() {
    await invoke("restart_app");
  }
}

export const desktopUpdates = new DesktopUpdates();
