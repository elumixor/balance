<script lang="ts">
  import { page } from "$app/state";
  import Screen from "$lib/components/Screen.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import type { Snippet } from "svelte";

  /**
   * Planning is one screen with two halves: the shape of the week, and the activities that
   * fill it. They share a title and a frame because they're the same job — the switch under
   * the header moves between them without the rail losing its place.
   */
  let { children }: { children: Snippet } = $props();

  type SectionKey = "week" | "activities";

  const SECTIONS: { value: SectionKey; label: string; href: string; subtitle: string }[] = [
    {
      value: "week",
      label: "Week",
      href: "/planning/week",
      subtitle: "168 hours. Decide where they go before they go.",
    },
    {
      value: "activities",
      label: "Activities",
      href: "/planning/activities",
      subtitle: "What you do, and how each one splits across your week.",
    },
  ];

  const current = $derived(SECTIONS.find((s) => page.url.pathname.startsWith(s.href)) ?? SECTIONS[0]);
</script>

<Screen title="Planning" subtitle={current.subtitle} wide>
  <!-- The rule the tabs sit on is the same hairline every list uses, so the switch reads as
       part of the page rather than a control bolted above it. -->
  <div class="mb-6 border-b border-line md:mb-8">
    <Segmented options={SECTIONS} value={current.value} />
  </div>

  {@render children()}
</Screen>
