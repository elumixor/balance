<script lang="ts">
  import Divider from "$lib/components/Divider.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import PopoverItem from "$lib/components/PopoverItem.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import { updateCalendarPrefs } from "$lib/queries";
  import { invalidate, store } from "$lib/store.svelte";
  import { CalendarCog } from "lucide-svelte";
  import { calendarData } from "./calendar-data.svelte";

  /** Which of the account's calendars the grid draws, and which one new events land in. */
  const prefs = store.calendars;
  const calendars = $derived(prefs.value?.calendars ?? []);
  const visible = $derived(prefs.value?.visibleCalendarIds ?? []);
  const writeId = $derived(prefs.value?.writeCalendarId ?? "primary");

  const isVisible = (id: string, primary: boolean) => (visible.length === 0 ? primary : visible.includes(id));

  async function save(input: { visibleCalendarIds?: string[]; writeCalendarId?: string }) {
    try {
      await updateCalendarPrefs(input);
      invalidate.integrations();
      await Promise.all([prefs.refresh(), calendarData.week.refresh()]);
    } catch (e) {
      calendarData.actionError = e instanceof Error ? e.message : "Couldn't save that.";
    }
  }

  function toggle(id: string, primary: boolean) {
    const current = visible.length === 0 ? calendars.filter((c) => c.primary).map((c) => c.id) : visible;
    const next = isVisible(id, primary) ? current.filter((c) => c !== id) : [...current, id];
    void save({ visibleCalendarIds: next });
  }
</script>

<Popover width={280}>
  {#snippet trigger(open: () => void)}
    <button
      type="button"
      onclick={() => {
        void prefs.ensure();
        open();
      }}
      aria-label="Choose calendars"
      class="press-sm flex size-8 items-center justify-center rounded-md bg-surface-alt"
    >
      <CalendarCog size={16} />
    </button>
  {/snippet}

  {#snippet content()}
    <SectionHeader title="Show" />
    {#each calendars as calendar (calendar.id)}
      <PopoverItem
        label={calendar.name}
        selected={isVisible(calendar.id, calendar.primary)}
        onclick={() => toggle(calendar.id, calendar.primary)}
      />
    {/each}
    <Divider />
    <SectionHeader title="Add events to" />
    {#each calendars.filter((c) => !c.readOnly) as calendar (calendar.id)}
      <PopoverItem
        label={calendar.name}
        selected={calendar.id === writeId || (writeId === "primary" && calendar.primary)}
        onclick={() => void save({ writeCalendarId: calendar.id })}
      />
    {/each}
  {/snippet}
</Popover>
