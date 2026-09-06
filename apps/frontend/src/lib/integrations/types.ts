export interface IntegrationStatus {
  accountId: string;
  provider: string;
  connected: boolean;
  needsReconnect: boolean;
  email: string | null;
}

import type { Icon } from "lucide-svelte";
import type { Component } from "svelte";
import type { CalendarEvent } from "$lib/calendar/types";

export interface RecordWindow {
  readonly start: Date;
  readonly end: Date;
}

export interface Feed {
  readonly id: string;
  readonly label: string;
  /** What linking does, in one line under the name. */
  readonly note: string;
  /**
   * Reads the feed for one occurrence's window. Null when it saw nothing. The record it wrote
   * last time is handed back, for whatever it has to carry forward — the block's planned time
   * survives there once the block has been moved to the night.
   */
  record(window: RecordWindow, previous: Record<string, unknown> | null): Promise<Record<string, unknown> | null>;
  /** When the record says the thing really happened, for the occurrence to be moved to. */
  actual?(record: Record<string, unknown>): RecordWindow | null;
  /** The section the event card draws for a linked event. */
  readonly section: Component<{ event: CalendarEvent }>;
}

export interface Integration {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly icon: typeof Icon;
  /** Whether this device can read it at all. */
  readonly available: boolean;
  /** What the buttons say instead when it can't. */
  readonly unavailableNote: string;
  readonly feeds: readonly Feed[];
  /** Whatever asking permission means for it — a system sheet, an OAuth dance. */
  connect(): Promise<void>;
}

export interface FeedStatus {
  syncing: boolean;
  syncedAt: number | null;
  error: string | null;
}
