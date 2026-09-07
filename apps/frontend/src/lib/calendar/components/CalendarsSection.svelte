<script lang="ts">
  import { restColor } from "$lib/ui/colors";
  import { saveCalendarPrefs as save } from "$lib/calendar/calendar-prefs";
  import { invalidate, store } from "$lib/core/store.svelte";
  import type { CalendarRef } from "$lib/calendar/types";
  import { Eye, EyeOff, Plus } from "lucide-svelte";
  import { Spinner } from "$lib/components";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { connectGoogle } from "$lib/calendar/connect";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";

  /**
   * Every connected account, grouped by the address it's signed in as, and which of their
   * calendars are drawn and which one new events land in.
   *
   * Its own component because it is asked for from two places that share nothing else: the rail,
   * beside the week it filters, and settings, where connecting an account belongs. One copy means
   * the two can't drift into disagreeing about what "visible" means. The rail draws it small, to
   * sit under the month; the settings page draws it at the size of every other row there.
   */
  let { variant = "rail" }: { variant?: "rail" | "page" } = $props();

  const page = $derived(variant === "page");
  const rowText = $derived(page ? "t-label" : "t-micro");
  const rowPad = $derived(page ? "min-h-9 gap-3 px-1.5 py-1" : "gap-2 px-2 py-1.5");
  const glyphSize = $derived(page ? 16 : 12);

  const data = calendarData;
  const prefs = store.calendars;

  const accounts = $derived(prefs.value?.accounts ?? []);
  const allCalendars = $derived(accounts.flatMap((a) => a.calendars));
  const visible = $derived(prefs.value?.visibleCalendarIds ?? []);
  const writeId = $derived(prefs.value?.writeCalendarId ?? "");

  // An empty list isn't "nothing shown" — it's the untouched default, which is each account's
  // primary calendar.
  const isVisible = (calendar: CalendarRef) => (visible.length === 0 ? calendar.primary : visible.includes(calendar.id));
  const isWriteTarget = (calendar: CalendarRef) => calendar.id === writeId;

  $effect(() => {
    if (data.connected) void prefs.ensure();
  });

  /**
   * Nothing here may say "connect" until the server has said there is nothing connected: on a
   * cold start the accounts are simply not here yet, and a button offered for that moment is
   * taken back as soon as the answer lands.
   */
  const loading = $derived(!data.connectionKnown || (data.connected && !prefs.hasValue));

  function toggle(calendar: CalendarRef) {
    const current = visible.length === 0 ? allCalendars.filter((c) => c.primary).map((c) => c.id) : visible;
    const next = isVisible(calendar) ? current.filter((id) => id !== calendar.id) : [...current, calendar.id];
    save({ visibleCalendarIds: next });
  }

  function selectWrite(calendar: CalendarRef) {
    if (isWriteTarget(calendar)) return;
    save({ writeCalendarId: calendar.id });
  }

  let connecting = $state(false);

  /** The first connection and every later one are the same flow — Google's own account chooser is
   *  what makes this a second account instead of reauthorizing the first. Either way the week is
   *  asked for again: with the first account it goes from empty to full. */
  async function addAccount() {
    connecting = true;
    try {
      await connectGoogle();
      invalidate.integrations();
      await Promise.all([prefs.refresh(), data.refreshWeeks()]);
    } catch (e) {
      diagnostics.report("Google Calendar", e, { title: "Couldn’t connect Google Calendar" });
    } finally {
      connecting = false;
    }
  }
</script>

{#if loading}
  <div class="flex items-center gap-2 px-2 py-1.5 text-fg-faint" aria-busy="true">
    <Spinner size={14} />
    <span class="t-micro">Loading calendars…</span>
  </div>
{:else}
  <div class="space-y-3">
    {#each accounts as account (account.accountId)}
      <div>
        <div class="t-micro truncate pb-1 text-fg-faint {page ? 'px-1.5' : 'px-2'}">
          {account.email ?? "Unknown account"}{account.needsReconnect ? " — reconnect" : ""}
        </div>
        <div class="flex flex-col gap-0.5">
          {#each account.calendars as calendar (calendar.id)}
            {@const shown = isVisible(calendar)}
            {@const isWrite = isWriteTarget(calendar)}
            <div class="hoverable flex items-center rounded-md {rowPad}">
              <!-- The colour swatch doubles as the write-target picker: click it to make new events land here. -->
              <button
                type="button"
                aria-label="Add new events to {calendar.name}"
                aria-pressed={isWrite}
                disabled={calendar.readOnly}
                onclick={() => selectWrite(calendar)}
                class="flex min-w-0 flex-1 items-center text-left disabled:cursor-default {page ? 'gap-3' : 'gap-2'}"
              >
                <span class="flex shrink-0 items-center justify-center {page ? 'size-7' : ''}">
                  <span
                    class="size-1.5 rounded-full {isWrite ? 'ring-1 ring-fg ring-offset-2 ring-offset-surface' : ''}"
                    style="background:{calendar.color ?? restColor}"
                  ></span>
                </span>
                <span class="{rowText} min-w-0 flex-1 truncate {shown ? 'text-fg' : 'text-fg-faint'}">
                  {calendar.name}
                </span>
              </button>
              <button
                type="button"
                aria-label={shown ? "Hide {calendar.name}" : "Show {calendar.name}"}
                aria-pressed={shown}
                onclick={() => toggle(calendar)}
                class="bare-button {page ? 'size-7' : 'size-5'}"
              >
                {#if shown}<Eye size={glyphSize} />{:else}<EyeOff size={glyphSize} />{/if}
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/each}

    <button
      type="button"
      disabled={connecting}
      onclick={() => void addAccount()}
      class="{rowText} hoverable press-sm flex w-full items-center rounded-md text-left disabled:opacity-60 {rowPad} {page
        ? 'text-fg'
        : 'text-fg-faint'}"
    >
      <span class="flex shrink-0 items-center justify-center {page ? 'size-7 text-fg-muted' : ''}"><Plus size={page ? 16 : 13} /></span>
      <span>Add calendar account</span>
    </button>
  </div>
{/if}
