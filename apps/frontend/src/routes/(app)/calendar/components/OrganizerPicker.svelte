<script lang="ts">
  import { Field, Popover, Spinner } from "$lib/components";
  import { preferences } from "$lib/account/preferences.svelte";
  import { accountHint, accountLabel, matchesAccount } from "$lib/calendar/account-names";
  import type { CalendarAccount, CalendarRef } from "$lib/calendar/types";
  import { store } from "$lib/core/store.svelte";
  import { restColor } from "$lib/ui/colors";
  import { Check, ChevronDown } from "lucide-svelte";

  /**
   * Who hosts the event, as a choice rather than a fact. An event is organized by the calendar it
   * was written in, so changing the organizer is choosing another calendar — grouped by the
   * account each belongs to, since "which of my addresses is this from" is the real question and
   * two accounts can each have a calendar called Work.
   *
   * Accounts go by the names given them in settings, with the address underneath, and the line at
   * the top narrows the list by either — or by a calendar's own name — so with four accounts the
   * right one is a few letters and Enter.
   *
   * A calendar the account can only read can't host anything, so it is listed but not offered.
   */
  let {
    calendarId,
    label,
    onchoose,
  }: {
    /** The event's own calendar, qualified with its account — what the tick is beside. */
    calendarId: string;
    /** The organizer's name as the guest list draws it, which is the trigger. */
    label: string;
    onchoose: (calendarId: string) => void;
  } = $props();

  const prefs = store.calendars;
  const accounts = $derived(prefs.value?.accounts ?? []);

  let query = $state("");

  /** Whether the search field is worth the room: with one account it only gets in the way. */
  const searchable = $derived(accounts.length > 1 || accounts.some((a) => a.calendars.length > 3));

  const aliasOf = (account: CalendarAccount) => preferences.aliasOf(account.accountId);

  /** Each account with the calendars that fit the text: all of them when the account itself does. */
  const shown = $derived(
    accounts
      .map((account) => ({
        account,
        calendars: matchesAccount(account, aliasOf(account), query)
          ? account.calendars
          : account.calendars.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())),
      }))
      .filter((group) => group.calendars.length > 0),
  );

  /** Enter takes the first calendar that can host — the one the eye lands on. */
  function first() {
    return shown.flatMap((group) => group.calendars).find((c) => !c.readOnly) ?? null;
  }

  // Asked for when the card is opened rather than when the panel is: the panel has to be able to
  // draw its list on the frame it appears, or it would measure itself empty and place itself wrong.
  $effect(() => void prefs.ensure());

  function choose(calendar: CalendarRef, close: () => void) {
    close();
    query = "";
    if (calendar.id !== calendarId) onchoose(calendar.id);
  }
</script>

<Popover width={280} align="start">
  {#snippet trigger(open)}
    <button
      type="button"
      onclick={open}
      aria-label="Change who organizes this event"
      class="press-sm flex min-w-0 items-center gap-1 rounded text-left hover:text-fg"
    >
      <span class="t-label min-w-0 truncate">{label}</span>
      <ChevronDown size={11} class="shrink-0 text-fg-faint" />
    </button>
  {/snippet}
  {#snippet content(close, ready)}
    {#if searchable}
      <div class="px-2 pt-1 pb-1">
        <Field
          bind:value={query}
          variant="bare-sm"
          placeholder="Account or calendar"
          ariaLabel="Find an account or a calendar"
          autofocus={ready}
          onkeydown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const calendar = first();
            if (calendar) choose(calendar, close);
          }}
        />
      </div>
    {/if}
    {#if accounts.length === 0}
      <div class="flex items-center gap-2 px-3 py-2.5 text-fg-faint" aria-busy="true">
        <Spinner size={14} />
        <span class="t-micro">Loading calendars…</span>
      </div>
    {:else}
      {#each shown as { account, calendars } (account.accountId)}
        {@const alias = aliasOf(account)}
        <div class="flex items-baseline gap-1.5 px-3 pt-2 pb-1">
          <span class="t-micro min-w-0 truncate text-fg-muted">{accountLabel(account, alias)}</span>
          {#if accountHint(account, alias)}<span class="t-micro min-w-0 truncate text-fg-faint">{account.email}</span>{/if}
          {#if account.needsReconnect}<span class="t-micro shrink-0 text-caution">reconnect</span>{/if}
        </div>
        {#each calendars as calendar (calendar.id)}
          {@const current = calendar.id === calendarId}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={current}
            disabled={calendar.readOnly && !current}
            onclick={() => choose(calendar, close)}
            class="t-label flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-alt
              disabled:cursor-default disabled:text-fg-faint"
          >
            <span class="flex size-3 shrink-0 items-center justify-center">
              {#if current}<Check size={12} />{/if}
            </span>
            <span class="size-2.5 shrink-0 rounded-sm" style="background:{calendar.color ?? restColor}"></span>
            <span class="min-w-0 flex-1 truncate">{calendar.name}</span>
          </button>
        {/each}
      {:else}
        <p class="t-micro px-3 py-2 text-fg-faint">Nothing matches.</p>
      {/each}
    {/if}
  {/snippet}
</Popover>
