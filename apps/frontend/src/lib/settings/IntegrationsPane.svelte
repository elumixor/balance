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
  import Tooltip from "$lib/components/Tooltip.svelte";
  import { ChevronDown } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import ChoiceRow from "./ChoiceRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * What feeds the calendar from outside — Apple Health today. One row per integration: its
   * glyph, its name, one line on what it brings, and a Connect button. Connected, the row grows
   * the two decisions a feed needs — what its hours count as, and which calendar they go in.
   * Everything here is this device's: on a machine that can't run one, the button is inert and
   * says on hover which app can.
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

  /** Connecting switches on every feed the integration has; there is one, and a second one would still be the point. */
  function connect(integration: Integration) {
    for (const feed of integration.feeds) {
      const category = categoryOf(integrations.settings(integration.id, feed.id).categoryId) ?? guessCategory(feed);
      if (category) void integrations.enable(integration, feed, category.id);
    }
  }

  function disconnect(integration: Integration) {
    for (const feed of integration.feeds) integrations.disable(integration, feed);
  }

  const connected = (integration: Integration) =>
    integration.feeds.some((feed) => integrations.settings(integration.id, feed.id).enabled);

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

<SettingsGroup
  title="Integrations"
  note="Other apps that already know how some of your hours went. Connect one and what it saw is written into your calendar, as its own events, so the week is what actually happened."
  divided={false}
>
  <ul class="divide-y divide-line">
    {#each INTEGRATIONS as integration (integration.id)}
      {@const on = connected(integration)}
      <li class="space-y-4 py-4 first:pt-0 last:pb-0">
        <div class="flex items-center gap-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-alt text-fg-muted">
            <integration.icon size={18} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="t-body text-fg">{integration.name}</p>
            <p class="t-micro text-fg-faint">{integration.note}</p>
          </div>
          {#if !integration.available}
            <Tooltip label={integration.unavailableNote}>
              <Button label="Connect" variant="outline" size="sm" disabled onclick={() => undefined} />
            </Tooltip>
          {:else if on}
            <Button label="Disconnect" variant="outline" size="sm" onclick={() => disconnect(integration)} />
          {:else}
            <Button label="Connect" size="sm" onclick={() => connect(integration)} />
          {/if}
        </div>

        {#if integration.available}
          {#each integration.feeds as feed (feed.id)}
            {@const settings = integrations.settings(integration.id, feed.id)}
            {@const status = integrations.status(integration.id, feed.id)}
            {@const category = categoryOf(settings.categoryId)}
            {@const calendar = calendarOf(settings.calendarId)}
            {#if settings.enabled}
              <div class="space-y-3 pl-12">
                <ChoiceRow label="{feed.label} counts as">
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
                  <CategoryIcon
                    icon={category ? (category.isBuffer ? DEFAULT_ICON : category.icon) : DEFAULT_ICON}
                    color={markColor(category)}
                    size={18}
                  />
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
              </div>
            {/if}
          {/each}
        {/if}
      </li>
    {/each}
  </ul>
</SettingsGroup>
