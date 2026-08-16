<script lang="ts">
  import { restColor } from "$lib/colors";
  import { disconnectGoogle, updateCalendarPrefs } from "$lib/queries";
  import { invalidate, store } from "$lib/store.svelte";
  import { Eye, EyeOff } from "lucide-svelte";
  import { calendarData } from "./calendar-data.svelte";
  import ConnectGoogle from "./ConnectGoogle.svelte";

  /**
   * Which of the account's calendars are drawn, and which one new events land in.
   *
   * Its own component because it is asked for from two places that share nothing else: the rail,
   * beside the week it filters, and settings, where connecting an account belongs. One copy means
   * the two can't drift into disagreeing about what "visible" means.
   */
  const data = calendarData;
  const prefs = store.calendars;

  const calendars = $derived(prefs.value?.calendars ?? []);
  const visible = $derived(prefs.value?.visibleCalendarIds ?? []);
  const writeId = $derived(prefs.value?.writeCalendarId ?? "primary");

  // An empty list isn't "nothing shown" — it's the untouched default, which is the primary calendar.
  const isVisible = (id: string, primary: boolean) => (visible.length === 0 ? primary : visible.includes(id));
  const isWriteTarget = (id: string, primary: boolean) => id === writeId || (writeId === "primary" && primary);

  $effect(() => {
    if (data.connected) void prefs.ensure();
  });

  /** Applies the change to the screen immediately, then tells the server — reverting only on failure. */
  function save(input: { visibleCalendarIds?: string[]; writeCalendarId?: string }) {
    const previous = prefs.value;
    if (!previous) return;
    prefs.set({ ...previous, ...input });
    void updateCalendarPrefs(input).catch((e) => {
      prefs.set(previous);
      data.actionError = e instanceof Error ? e.message : "Couldn't save that.";
    });
  }

  function toggle(id: string, primary: boolean) {
    const current = visible.length === 0 ? calendars.filter((c) => c.primary).map((c) => c.id) : visible;
    const next = isVisible(id, primary) ? current.filter((c) => c !== id) : [...current, id];
    save({ visibleCalendarIds: next });
  }

  function selectWrite(id: string) {
    if (isWriteTarget(id, calendars.find((c) => c.id === id)?.primary ?? false)) return;
    save({ writeCalendarId: id });
  }

  /** The mappings outlive this: they key on Google's own event ids, so reconnecting restores them. */
  async function disconnect() {
    try {
      await disconnectGoogle();
      invalidate.integrations();
      await Promise.all([prefs.refresh(), data.refreshWeeks()]);
    } catch (e) {
      data.actionError = e instanceof Error ? e.message : "Couldn't disconnect.";
    }
  }
</script>

{#if !data.connected}
  <ConnectGoogle />
{:else}
  <div class="flex flex-col gap-0.5">
    {#each calendars as calendar (calendar.id)}
      {@const shown = isVisible(calendar.id, calendar.primary)}
      {@const isWrite = isWriteTarget(calendar.id, calendar.primary)}
      <div class="hoverable flex items-center gap-1 rounded-md pr-1">
        <!-- The colour swatch doubles as the write-target picker: click it to make new events land here. -->
        <button
          type="button"
          aria-label="Add new events to {calendar.name}"
          aria-pressed={isWrite}
          disabled={calendar.readOnly}
          onclick={() => selectWrite(calendar.id)}
          class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left disabled:cursor-default"
        >
          <span
            class="size-3 shrink-0 rounded-full {isWrite ? 'ring-2 ring-fg ring-offset-1 ring-offset-surface' : ''}"
            style="background:{calendar.color ?? restColor}"
          ></span>
          <span class="t-label min-w-0 flex-1 truncate {shown ? 'text-fg' : 'text-fg-faint'}">
            {calendar.name}
          </span>
        </button>
        <button
          type="button"
          aria-label={shown ? "Hide {calendar.name}" : "Show {calendar.name}"}
          aria-pressed={shown}
          onclick={() => toggle(calendar.id, calendar.primary)}
          class="press-sm flex size-6 shrink-0 items-center justify-center rounded text-fg-faint hover:text-fg"
        >
          {#if shown}<Eye size={14} />{:else}<EyeOff size={14} />{/if}
        </button>
      </div>
    {/each}
  </div>

  <button type="button" class="t-micro press-sm mt-2 px-2 py-1 text-fg-faint" onclick={() => void disconnect()}>
    Disconnect Google
  </button>
{/if}
