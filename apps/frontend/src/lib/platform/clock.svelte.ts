import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { MS_PER_MINUTE } from "$lib/calendar/dates";

/**
 * One ticking "now" for everything that draws the passage of time — the now line, the today
 * marker, whether an event is already over.
 *
 * Reading `new Date()` inside a `$derived` reads it once and never again: nothing invalidates a
 * wall clock, so the line drawn at load time stays there all day. Everything that cares reads
 * `clock.now` instead, which is `$state` and moves.
 *
 * The tick is a timeout aimed at the next minute boundary rather than a one-minute interval,
 * because both app shells suspend timers while backgrounded and an interval would come back
 * however many minutes late it was put to sleep for. Resume, foreground and visibility all
 * re-read the clock immediately, so a phone unlocked after an hour is right before it repaints.
 */
class Clock {
  #now = $state(new Date());
  #started = false;

  /** The current minute. Starts the tick on first read, and keeps ticking for the session. */
  get now(): Date {
    this.#start();
    return this.#now;
  }

  /** Midnight of the current day, as a timestamp — what "is this today" is measured against. */
  get todayStart(): number {
    const day = new Date(this.now);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  }

  #start() {
    if (this.#started) return;
    this.#started = true;

    this.#schedule();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.#sync();
    });
    window.addEventListener("focus", () => this.#sync());
    if (Capacitor.isNativePlatform()) void App.addListener("resume", () => this.#sync());
  }

  #schedule() {
    const untilNextMinute = MS_PER_MINUTE - (Date.now() % MS_PER_MINUTE);
    setTimeout(() => {
      this.#now = new Date();
      this.#schedule();
    }, untilNextMinute);
  }

  #sync() {
    this.#now = new Date();
  }
}

export const clock = new Clock();
