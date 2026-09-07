<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/account/auth.svelte";
  import { Button, Skeleton, StarCount, Tooltip } from "$lib/components";
  import { desktopAutostart } from "$lib/desktop/autostart.svelte";
  import { isDesktop } from "$lib/desktop/platform";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { progressData } from "$lib/planning/progress.svelte";
  import { sessionData } from "$lib/planning/session-data.svelte";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { settings } from "$lib/settings";
  import { ArrowRight, CalendarCheck, Flame, History, Power, SunMoon } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";
  import StarRecord from "./StarRecord.svelte";
  import ThemeSwitch from "./ThemeSwitch.svelte";
  import ToggleRow from "./ToggleRow.svelte";

  /**
   * Who is signed in, where they stand, and the two things the app is for: the last recap and the
   * next day. No headings — three short rows, each read in one glance.
   *
   * The sitting lives here on purpose rather than only behind a notification: one waved away is
   * still owed, and this is where the avatar's dot leads. The plan button is inked while it is.
   */
  let { onsignout }: { onsignout: () => void } = $props();

  const SUBTIERS = 5;

  progressData.ensure();
  $effect(() => void sessionData.enter(sessionNudge.slot));

  const initial = $derived((auth.name || auth.email || "?").charAt(0).toUpperCase());
  const progress = $derived(progressData.value);
  const summary = $derived(sessionData.summary);
  const subject = $derived(summary?.slot === "morning" ? "today" : "tomorrow");

  /** What the last recap's day earned, from the same record the grid below draws. */
  const recapStars = $derived(
    summary && progress ? (progress.recent.find((cell) => cell.day === summary.review.day)?.stars ?? 0) : 0,
  );

  // Read when the pane opens: the answer belongs to the system, and could have changed there.
  $effect(() => void desktopAutostart.load());

  function openRecap() {
    settings.hide();
    void goto(`/session?slot=${sessionNudge.slot}`);
  }

  function plan() {
    if (!summary) return;
    settings.hide();
    planMode.startFrom(summary);
  }
</script>

{#snippet starCount(value: number)}
  <StarCount {value} size={13} />
{/snippet}

<div>
  <!-- Who: the face, the total, the door out. -->
  <div class="flex flex-col items-center">
    <div class="relative">
      <span
        class="t-heading flex size-20 items-center justify-center overflow-hidden rounded-full
          border border-line-strong bg-surface-alt text-fg-muted"
      >
        {#if auth.avatarUrl}
          <img src={auth.avatarUrl} alt="" class="size-full object-cover" />
        {:else}
          {initial}
        {/if}
      </span>
      {#if progress}
        <span class="absolute -right-2 -bottom-1 ring-3 ring-surface rounded-full">
          {@render starCount(progress.rank.stars)}
        </span>
      {/if}
    </div>

    <div class="mt-5 flex w-full items-center gap-3 rounded-md border border-line-strong py-2.5 pr-2 pl-4">
      <div class="min-w-0 flex-1">
        <p class="t-body-strong truncate text-fg">{auth.name || auth.email || "Signed in"}</p>
        {#if auth.name && auth.email}
          <p class="t-micro truncate text-fg-faint">{auth.email}</p>
        {/if}
      </div>
      <Tooltip label="Sign out">
        <Button
          variant="bare"
          title="Sign out"
          onclick={onsignout}
          class="rounded-full border border-line-strong text-fg-muted"
        >
          {#snippet icon()}<ArrowRight size={16} />{/snippet}
        </Button>
      </Tooltip>
    </div>
  </div>

  <!-- The sitting, on demand. -->
  <div class="mt-4 divide-y divide-line rounded-md border border-line-strong">
    {#if summary}
      <SettingRow
        icon={CalendarCheck}
        label={summary.target.planned ? `Look over ${subject}` : `Plan ${subject}`}
        onclick={plan}
      >
        {#if sessionNudge.owed}
          <span class="relative flex items-center">
            {#if !summary.target.planned && sessionNudge.stars > 0}{@render starCount(sessionNudge.stars)}{/if}
            <span class="absolute -top-1 -right-1 size-2 rounded-full border border-surface bg-danger"></span>
          </span>
        {:else if !summary.target.planned && sessionNudge.stars > 0}
          {@render starCount(sessionNudge.stars)}
        {/if}
      </SettingRow>
    {/if}
    <SettingRow icon={History} label="Last recap" onclick={summary ? openRecap : undefined} disabled={!summary}>
      {#if recapStars > 0}{@render starCount(recapStars)}{/if}
    </SettingRow>
  </div>

  <!-- Where you stand. -->
  <div class="mt-4">
    {#if !progress}
      <Skeleton width="40%" height={16} />
    {:else}
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1.5">
        <span
          class="flex items-center gap-1"
          aria-label="Tier {progress.rank.tier + 1}, {progress.rank.subtier + 1} of {SUBTIERS}"
        >
          {#each Array.from({ length: SUBTIERS }) as _, index (index)}
            <span class="size-1.5 rounded-full {index <= progress.rank.subtier ? 'bg-ink' : 'bg-line-strong'}"></span>
          {/each}
        </span>
        <span class="t-micro text-fg-faint">{progress.rank.toNextSubtier} to go</span>
        {#if progress.streak > 0}
          <span class="t-micro flex items-center gap-1 text-fg-muted">
            <Flame size={13} />
            {progress.streak} {progress.streak === 1 ? "day" : "days"}
          </span>
        {/if}
      </div>
    {/if}

    {#if progress}
      <StarRecord {progress} />
    {/if}
  </div>

  <!-- How it looks, and the shell it runs in. -->
  <div class="mt-8 space-y-1 border-t border-line pt-5">
    <SettingRow icon={SunMoon} label="Appearance">
      <ThemeSwitch />
    </SettingRow>
    {#if isDesktop}
      <ToggleRow
        icon={Power}
        label="Open at login"
        checked={desktopAutostart.enabled === true}
        disabled={desktopAutostart.enabled === null}
        onchange={(enabled) => void desktopAutostart.set(enabled)}
      />
    {/if}
  </div>
</div>
