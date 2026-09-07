<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/account/auth.svelte";
  import { Button, Skeleton, StarCount } from "$lib/components";
  import { desktopAutostart } from "$lib/desktop/autostart.svelte";
  import { isDesktop } from "$lib/desktop/platform";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { progressData } from "$lib/planning/progress.svelte";
  import { sessionData } from "$lib/planning/session-data.svelte";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { settings } from "$lib/settings";
  import { CalendarCheck, Flame, History, LogOut, Power, SunMoon } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";
  import StarRecord from "./StarRecord.svelte";
  import ThemeSwitch from "./ThemeSwitch.svelte";
  import ToggleRow from "./ToggleRow.svelte";

  /**
   * Who is signed in, where they stand, and the two things the app is for: the last recap and the
   * next day. One identity line — the face, the name, the count — and under it the same rows the
   * rest of settings is made of, so the page starts the way it goes on.
   *
   * The sitting lives here on purpose rather than only behind a notification: one waved away is
   * still owed, and this is where the avatar's dot leads.
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

<div class="space-y-1">
  <!-- Who, and where they stand. -->
  <div class="flex items-center gap-4 px-1.5 pb-4">
    <span
      class="t-body-strong flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full
        border border-line bg-surface-alt text-fg-muted"
    >
      {#if auth.avatarUrl}
        <img src={auth.avatarUrl} alt="" class="size-full object-cover" />
      {:else}
        {initial}
      {/if}
    </span>

    <div class="min-w-0 flex-1">
      <p class="t-body-strong truncate text-fg">{auth.name || auth.email || "Signed in"}</p>
      {#if auth.name && auth.email}
        <p class="t-micro truncate text-fg-faint">{auth.email}</p>
      {/if}
      {#if !progress}
        <Skeleton width="40%" height={14} />
      {:else}
        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
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
    </div>

    {#if progress}
      {@render starCount(progress.rank.stars)}
    {/if}
    <Button variant="bare" title="Sign out" onclick={onsignout}>
      {#snippet icon()}<LogOut size={16} />{/snippet}
    </Button>
  </div>

  <!-- The sitting, on demand. -->
  {#if summary}
    <SettingRow
      icon={CalendarCheck}
      label={summary.target.planned ? `Look over ${subject}` : `Plan ${subject}`}
      onclick={plan}
    >
      {#if sessionNudge.owed}
        <span class="size-2 rounded-full bg-danger" aria-label="Still to do"></span>
      {/if}
      {#if !summary.target.planned && sessionNudge.stars > 0}{@render starCount(sessionNudge.stars)}{/if}
    </SettingRow>
  {/if}
  <SettingRow icon={History} label="Last recap" onclick={summary ? openRecap : undefined} disabled={!summary}>
    {#if recapStars > 0}{@render starCount(recapStars)}{/if}
  </SettingRow>
  {#if progress}
    <StarRecord {progress} />
  {/if}

  <!-- How it looks, and the shell it runs in. -->
  <div class="mt-4 space-y-1 border-t border-line pt-4">
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
