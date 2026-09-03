<script lang="ts">
  import { restColor } from "$lib/colors";
  import Button from "$lib/components/Button.svelte";
  import CategoryIcon from "$lib/components/CategoryIcon.svelte";
  import Dot from "$lib/components/Dot.svelte";
  import InlineError from "$lib/components/InlineError.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import PopoverItem from "$lib/components/PopoverItem.svelte";
  import { DEFAULT_ICON } from "$lib/icons";
  import { type Feed, INTEGRATIONS, type Integration, integrations } from "$lib/integrations/integrations.svelte";
  import { store } from "$lib/store.svelte";
  import { categories } from "$lib/synced.svelte";
  import type { CalendarRef, Category } from "$lib/types";
  import { ChevronDown } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import ChoiceRow from "./ChoiceRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";
  import ToggleRow from "./ToggleRow.svelte";

  /**
   * What feeds the calendar from outside — Apple Health today. One group per integration, one
   * switch per feed, and under each switch the two decisions a feed needs: what its hours count
   * as, and which calendar they go in. Everything here is this device's: the note under an
   * integration that can't run says which app it does run in.
   */
  const plan = $derived(categories.all);
  const prefs = store.calendars;

  /** Only calendars the week draws: an event written where nothing reads is one the next sync writes again. */
  const visibleCalendars = $derived.by(() => {
    const value = prefs.value;
    if (!value) return [] as CalendarRef[];
    const all = value.accounts.flatMap((a) => a.calendars);
    const chosen = value.visibleCalendarIds;
    return all.filter((c) => !c.readOnly && (chosen.length === 0 ? c.primary : chosen.includes(c.id)));
  });

  $effect(() => {
    void prefs.ensure();
  });

  const categoryOf = (id: string | null) => plan.find((c) => c.id === id) ?? null;
  const calendarOf = (id: string | null) => visibleCalendars.find((c) => c.id === id) ?? null;

  /**
   * The first sync needs a category, and a switch is one tap. So the tap guesses: a category
   * already named for the feed — "Sleep" for sleep — and otherwise the buffer, the same place an
   * hour nobody planned already lands. Either is changed under the switch afterwards.
   */
  function guessCategory(feed: Feed): Category | null {
    const word = feed.label.toLowerCase();
    return plan.find((c) => c.name.toLowerCase().includes(word)) ?? plan.find((c) => c.isBuffer) ?? plan[0] ?? null;
  }

  function toggle(integration: Integration, feed: Feed, on: boolean) {
    if (!on) return integrations.disable(integration, feed);
    const category = categoryOf(integrations.settings(integration.id, feed.id).categoryId) ?? guessCategory(feed);
    if (!category) return;
    void integrations.enable(integration, feed, category.id);
  }

  function markColor(category: Category | null) {
    return category && !category.isBuffer ? category.color : restColor;
  }

  function when(at: number | null) {
    if (at === null) return null;
    const minutes = Math.round((Date.now() - at) / 60_000);
    if (minutes < 1) return "Synced just now";
    if (minutes < 60) return `Synced ${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `Synced ${hours}h ago` : `Synced ${Math.round(hours / 24)}d ago`;
  }
</script>

{#snippet chooser(open: () => void, ariaLabel: string, label: string, badge: Snippet)}
  <button
    type="button"
    onclick={open}
    aria-label={ariaLabel}
    class="hoverable press-sm flex min-w-0 max-w-[60%] items-center gap-2 rounded-md border border-line px-2 py-1.5
      text-left"
  >
    {@render badge()}
    <span class="t-label min-w-0 flex-1 truncate">{label}</span>
    <ChevronDown size={14} class="shrink-0 text-fg-faint" />
  </button>
{/snippet}

{#each INTEGRATIONS as integration, index (integration.id)}
  <SettingsGroup title={integration.name} note={integration.note} divided={index > 0}>
    {#if !integration.available}
      <p class="t-label text-fg-faint">{integration.unavailableNote}</p>
    {:else}
      {#each integration.feeds as feed (feed.id)}
        {@const settings = integrations.settings(integration.id, feed.id)}
        {@const status = integrations.status(integration.id, feed.id)}
        {@const category = categoryOf(settings.categoryId)}
        {@const calendar = calendarOf(settings.calendarId)}
        <ToggleRow
          label={feed.label}
          note={feed.note}
          checked={settings.enabled}
          onchange={(on) => toggle(integration, feed, on)}
        />

        {#if settings.enabled}
          <ChoiceRow label="Counts as">
            {#snippet control()}
              <Popover width={240}>
                {#snippet trigger(open)}
                  {@render chooser(open, `Category ${feed.label} counts as`, category?.name ?? "Choose", categoryBadge)}
                {/snippet}
                {#snippet content(close)}
                  <div class="max-h-64 overflow-y-auto">
                    {#each plan as option (option.id)}
                      <PopoverItem
                        label={option.name}
                        selected={option.id === settings.categoryId}
                        onclick={() => {
                          integrations.update(integration.id, feed.id, { categoryId: option.id });
                          close();
                        }}
                      >
                        {#snippet icon()}
                          <CategoryIcon
                            icon={option.isBuffer ? DEFAULT_ICON : option.icon}
                            color={markColor(option)}
                            size={18}
                          />
                        {/snippet}
                      </PopoverItem>
                    {/each}
                  </div>
                {/snippet}
              </Popover>
            {/snippet}
          </ChoiceRow>
          {#snippet categoryBadge()}
            <CategoryIcon icon={category ? (category.isBuffer ? DEFAULT_ICON : category.icon) : DEFAULT_ICON} color={markColor(category)} size={18} />
          {/snippet}

          {#if visibleCalendars.length > 1}
            <ChoiceRow label="Calendar">
              {#snippet control()}
                <Popover width={260}>
                  {#snippet trigger(open)}
                    {@render chooser(open, `Calendar ${feed.label} lands in`, calendar?.name ?? "Where new events go", calendarBadge)}
                  {/snippet}
                  {#snippet content(close)}
                    <PopoverItem
                      label="Where new events go"
                      selected={settings.calendarId === null}
                      onclick={() => {
                        integrations.update(integration.id, feed.id, { calendarId: null });
                        close();
                      }}
                    />
                    {#each visibleCalendars as option (option.id)}
                      <PopoverItem
                        label={option.name}
                        selected={option.id === settings.calendarId}
                        onclick={() => {
                          integrations.update(integration.id, feed.id, { calendarId: option.id });
                          close();
                        }}
                      >
                        {#snippet icon()}
                          <Dot color={option.color ?? restColor} size={10} />
                        {/snippet}
                      </PopoverItem>
                    {/each}
                  {/snippet}
                </Popover>
              {/snippet}
            </ChoiceRow>
            {#snippet calendarBadge()}
              <Dot color={calendar?.color ?? restColor} size={10} />
            {/snippet}
          {/if}

          <div class="flex items-center justify-between gap-3">
            <p class="t-micro min-w-0 text-fg-faint">
              {status.summary ?? when(status.syncedAt) ?? "Not synced yet."}
            </p>
            <Button
              label="Sync now"
              variant="outline"
              size="sm"
              loading={status.syncing}
              onclick={() => void integrations.sync(integration, feed)}
            />
          </div>
        {/if}
        {#if status.error}
          <InlineError message={status.error} />
        {/if}
      {/each}
    {/if}
  </SettingsGroup>
{/each}
