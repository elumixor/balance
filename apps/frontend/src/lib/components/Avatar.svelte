<script lang="ts">
  import type { Person } from "$lib/people/types";

  /**
   * One person, as a circle: their picture when there is one, and their initials on their own
   * colour otherwise. Everything that draws a face draws it through here, so a face is the same
   * face on a project row, under a guest field and in the settings list.
   */
  let {
    person,
    size = 20,
    class: klass = "",
    style = "",
  }: { person: Person; size?: number; class?: string; style?: string } = $props();

  const initials = $derived(
    person.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?",
  );

  /** A picture that can't be fetched — a Google URL that went stale — falls back to the initials. */
  let broken = $state(false);
  const src = $derived(broken ? null : person.avatar);
</script>

<span
  title={person.name}
  style="width:{size}px;height:{size}px;background:{src ? 'var(--color-surface-alt)' : person.color};font-size:{Math.round(size * 0.42)}px;{style}"
  class="t-micro inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-white {klass}"
>
  {#if src}
    <img {src} alt={person.name} width={size} height={size} class="size-full object-cover" onerror={() => (broken = true)} />
  {:else}
    {initials}
  {/if}
</span>
