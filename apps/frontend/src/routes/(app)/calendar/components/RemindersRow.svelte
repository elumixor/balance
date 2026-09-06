<script lang="ts">
  import ComboField, { type ComboOption } from "$lib/components/ComboField.svelte";
  import { describeLead, formatLead, LEAD_PRESETS, parseLead } from "$lib/calendar/reminder-lead";
  import type { EventReminder } from "$lib/calendar/types";
  import { Bell, Plus, X } from "lucide-svelte";
  import { CardRow } from "$lib/components";

  /**
   * When the calendar itself will say something: one chip per reminder, and a field to add one
   * by typing "45m" or picking from the usual leads. A reminder is one lead; the calendar's own
   * distinction between a popup and an email is not one this app draws, so every one written
   * here is a popup.
   */
  let {
    reminders,
    editable,
    onchange,
  }: {
    reminders: EventReminder[];
    editable: boolean;
    onchange: (reminders: EventReminder[]) => void;
  } = $props();

  let adding = $state(false);
  let query = $state("");

  /** One chip per lead, soonest last — "5m, 1h, at time" reads as a countdown. */
  const leads = $derived([...new Set(reminders.map((r) => r.minutes))].sort((a, b) => b - a));

  const options = $derived.by((): ComboOption<number>[] => {
    const typed = parseLead(query);
    const presets = LEAD_PRESETS.filter((m) => !leads.includes(m)).map((minutes) => ({
      key: String(minutes),
      label: formatLead(minutes),
      hint: describeLead(minutes),
      value: minutes,
    }));
    if (typed === null || leads.includes(typed) || presets.some((p) => p.value === typed)) {
      const q = query.trim().toLowerCase();
      return q ? presets.filter((p) => p.label.startsWith(q) || p.hint.toLowerCase().startsWith(q)) : presets;
    }
    return [{ key: `typed:${typed}`, label: formatLead(typed), hint: describeLead(typed), value: typed }, ...presets];
  });

  function add(minutes: number) {
    adding = false;
    query = "";
    if (leads.includes(minutes)) return;
    onchange([...reminders, { method: "popup", minutes }]);
  }

  function remove(minutes: number) {
    onchange(reminders.filter((r) => r.minutes !== minutes));
  }
</script>

{#if leads.length === 0 && editable && !adding}
  <CardRow icon={Bell} label="Remind me" onclick={() => (adding = true)} />
{:else}
  <CardRow icon={Bell} set={leads.length > 0}>
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {#each leads as minutes (minutes)}
        <span class="chip-bare t-label">
          {formatLead(minutes)}
          {#if editable}
            <button
              type="button"
              aria-label="Remove reminder {formatLead(minutes)}"
              onclick={() => remove(minutes)}
              class="press-sm -mr-1 rounded p-0.5 text-fg-faint hover:text-fg"
            >
              <X size={12} />
            </button>
          {/if}
        </span>
      {/each}
      {#if editable && adding}
        <div class="w-32">
          <ComboField
            bind:value={query}
            {options}
            placeholder="5m, 1h, 1d…"
            ariaLabel="Add a reminder"
            autofocus
            variant="bare"
            width={220}
            onpick={(option) => add(option.value)}
            onfree={(text) => {
              const minutes = parseLead(text);
              if (minutes !== null) add(minutes);
            }}
          />
        </div>
      {:else if editable}
        <button
          type="button"
          aria-label="Add a reminder"
          onclick={() => (adding = true)}
          class="press-sm hoverable flex size-7 items-center justify-center rounded-md text-fg-faint hover:text-fg"
        >
          <Plus size={13} />
        </button>
      {:else if leads.length === 0}
        <span class="t-label text-fg-faint">No reminders</span>
      {/if}
    </div>
  </CardRow>
{/if}
