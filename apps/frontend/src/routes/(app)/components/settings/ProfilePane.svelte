<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import { Button, Skeleton, StarCount, StarGlyph, Tooltip } from "$lib/components";
  import { desktopAutostart } from "$lib/desktop/autostart.svelte";
  import { isDesktop, isNativeShell } from "$lib/desktop/platform";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { progressData } from "$lib/planning/progress.svelte";
  import { sessionData } from "$lib/planning/session-data.svelte";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { settings } from "$lib/settings";
  import { Flame, LogOut } from "lucide-svelte";
  import DesktopDownload from "./DesktopDownload.svelte";
  import DesktopUpdate from "./DesktopUpdate.svelte";
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
  <StarCount {value} size={11} />
{/snippet}

<div>
  <!-- Who. -->
  <div class="flex items-center gap-3">
    <span
      class="t-body flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full
        border border-line-strong bg-surface-alt text-fg-muted"
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
    </div>
    <Tooltip label="Sign out">
      <Button variant="bare" title="Sign out" onclick={onsignout} class="text-fg-muted">
        {#snippet icon()}<LogOut size={16} />{/snippet}
      </Button>
    </Tooltip>
  </div>

  <!-- Where you stand. -->
  <div class="mt-8">
    {#if !progress}
      <Skeleton width="40%" height={28} />
    {:else}
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span class="flex items-center gap-1.5">
          <StarGlyph size={20} />
          <span class="t-data-strong leading-none! text-fg">{progress.rank.stars}</span>
        </span>
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

    <!-- The sitting, on demand. -->
    <div class="mt-4 flex flex-wrap gap-2">
      <Button label="Last recap" variant="outline" size="sm" onclick={openRecap} disabled={!summary}>
        {#snippet icon()}{#if recapStars > 0}{@render starCount(recapStars)}{/if}{/snippet}
      </Button>
      {#if summary}
        <Button
          label={summary.target.planned ? `Look over ${subject}` : `Plan ${subject}`}
          variant={sessionNudge.owed ? "solid" : "outline"}
          size="sm"
          onclick={plan}
        >
          {#snippet icon()}
            {#if !summary.target.planned && sessionNudge.stars > 0}{@render starCount(sessionNudge.stars)}{/if}
          {/snippet}
        </Button>
      {/if}
    </div>

    {#if progress}
      <StarRecord {progress} />
    {/if}
  </div>

  <!-- How it looks, and the shell it runs in. -->
  <div class="mt-8 space-y-4 border-t border-line pt-5">
    <div class="flex items-center justify-between gap-3">
      <span class="t-label text-fg">Appearance</span>
      <ThemeSwitch />
    </div>
    {#if !isNativeShell}
      <DesktopDownload />
    {/if}
    {#if isDesktop}
      <ToggleRow
        label="Open at login"
        checked={desktopAutostart.enabled === true}
        disabled={desktopAutostart.enabled === null}
        onchange={(enabled) => void desktopAutostart.set(enabled)}
      />
      <DesktopUpdate />
    {/if}
  </div>
</div>
