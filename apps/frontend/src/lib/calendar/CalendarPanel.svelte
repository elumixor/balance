<script lang="ts">
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import { disconnectGoogle, updateCalendarPrefs } from "$lib/queries";
  import { invalidate, store } from "$lib/store.svelte";
  import { Check, PenLine } from "lucide-svelte";
  import ActivityPalette from "./ActivityPalette.svelte";
  import { calendarData } from "./calendar-data.svelte";
  import ConnectGoogle from "./ConnectGoogle.svelte";

  /**
   * Everything the calendar screen needs beside itself: which of the account's calendars are
   * drawn, which one new events land in, and the activities to drag onto the week. It lives in
   * the rail so the grid keeps the whole window, and in a popover on a phone, where there is
   * no rail.
   */
  const data = calendarData;
  const prefs = store.calendars;

  const calendars = $derived(prefs.value?.calendars ?? []);
  const visible = $derived(prefs.value?.visibleCalendarIds ?? []);
  const writeId = $derived(prefs.value?.writeCalendarId ?? "primary");
  const activities = $derived(store.activities.value ?? []);
  const categoryById = $derived(new Map((store.categories.value ?? []).map((c) => [c.id, c])));

  // An empty list isn't "nothing shown" — it's the untouched default, which is the primary calendar.
  const isVisible = (id: string, primary: boolean) => (visible.length === 0 ? primary : visible.includes(id));
  const isWriteTarget = (id: string, primary: boolean) => id === writeId || (writeId === "primary" && primary);

  $effect(() => {
    if (data.connected) void prefs.ensure();
  });

  async function save(input: { visibleCalendarIds?: string[]; writeCalendarId?: string }) {
    try {
      await updateCalendarPrefs(input);
      invalidate.integrations();
      await Promise.all([prefs.refresh(), data.week.refresh()]);
    } catch (e) {
      data.actionError = e instanceof Error ? e.message : "Couldn't save that.";
    }
  }

  function toggle(id: string, primary: boolean) {
    const current = visible.length === 0 ? calendars.filter((c) => c.primary).map((c) => c.id) : visible;
    const next = isVisible(id, primary) ? current.filter((c) => c !== id) : [...current, id];
    void save({ visibleCalendarIds: next });
  }

  /** The mappings outlive this: they key on Google's own event ids, so reconnecting restores them. */
  async function disconnect() {
    try {
      await disconnectGoogle();
      invalidate.integrations();
      await Promise.all([prefs.refresh(), data.week.refresh()]);
    } catch (e) {
      data.actionError = e instanceof Error ? e.message : "Couldn't disconnect.";
    }
  }
</script>

<div class="space-y-6">
  <section>
    <SectionHeader title="Calendars" />

    {#if !data.connected}
      <ConnectGoogle />
    {:else}
      <div class="flex flex-col gap-0.5">
        {#each calendars as calendar (calendar.id)}
          {@const shown = isVisible(calendar.id, calendar.primary)}
          <div class="hoverable flex items-center gap-1 rounded-md pr-1">
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={shown}
              onclick={() => toggle(calendar.id, calendar.primary)}
              class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
            >
              <span class="flex size-4 shrink-0 items-center justify-center">
                {#if shown}<Check size={14} />{/if}
              </span>
              <span class="t-label min-w-0 flex-1 truncate {shown ? 'text-fg' : 'text-fg-faint'}">
                {calendar.name}
              </span>
            </button>
            {#if !calendar.readOnly}
              <!-- One calendar has to take new events; the pen says which. -->
              <button
                type="button"
                aria-label="Add new events to {calendar.name}"
                aria-pressed={isWriteTarget(calendar.id, calendar.primary)}
                onclick={() => void save({ writeCalendarId: calendar.id })}
                class="press-sm flex size-6 shrink-0 items-center justify-center rounded {isWriteTarget(
                  calendar.id,
                  calendar.primary,
                )
                  ? 'bg-surface-alt text-fg'
                  : 'text-fg-faint'}"
              >
                <PenLine size={13} />
              </button>
            {/if}
          </div>
        {/each}
      </div>

      <button type="button" class="t-micro press-sm mt-2 px-2 py-1 text-fg-faint" onclick={() => void disconnect()}>
        Disconnect Google
      </button>
    {/if}
  </section>

  {#if data.connected && activities.length > 0}
    <section>
      <SectionHeader title="Activities" />
      <ActivityPalette {activities} categories={categoryById} />
    </section>
  {/if}
</div>
