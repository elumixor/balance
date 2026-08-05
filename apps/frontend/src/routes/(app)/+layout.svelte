<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { auth } from "$lib/auth.svelte";
  import AppLoading from "$lib/components/AppLoading.svelte";
  import { ChartPie, Scale, Shapes, Timer } from "lucide-svelte";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  const TABS = [
    { href: "/track", label: "Track", icon: Timer },
    { href: "/stats", label: "Balance", icon: Scale },
    { href: "/categories", label: "Week", icon: ChartPie },
    { href: "/activities", label: "Activities", icon: Shapes },
  ];

  $effect(() => {
    if (auth.loaded && !auth.signedIn) void goto("/sign-in", { replaceState: true });
  });
</script>

{#if !auth.loaded || !auth.signedIn}
  <AppLoading />
{:else}
  <div class="flex min-h-dvh flex-col bg-bg">
    <main class="flex-1 overflow-y-auto">
      {@render children()}
    </main>

    <nav class="safe-bottom flex border-t border-line bg-surface">
      {#each TABS as tab (tab.href)}
        {@const active = page.url.pathname === tab.href}
        <a
          href={tab.href}
          aria-current={active ? "page" : undefined}
          class="flex flex-1 flex-col items-center gap-1 py-2 {active ? 'text-fg' : 'text-fg-faint'}"
        >
          <tab.icon size={20} />
          <span class="t-micro">{tab.label}</span>
        </a>
      {/each}
    </nav>
  </div>
{/if}
