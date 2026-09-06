<script lang="ts">
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { theme } from "$lib/ui/theme.svelte";
  import { viewport } from "$lib/platform/viewport.svelte";
  import { Toaster, toast } from "svelte-sonner";
  import ProblemCard from "./ProblemCard.svelte";

  /**
   * The app's one way of saying something went wrong. Nothing else in this app draws a failure.
   *
   * Sonner does the part that is fiddly and solved — the leaning pile, expanding under the pointer,
   * swiping one away, the heights and the animation — and `diagnostics` stays the truth: this only
   * puts a card on screen for each problem it holds, and takes it off when the problem goes. So a
   * failure dismissed by hand, by a retry, or by a swipe all end the same way, in one place.
   */
  /** The phone's tab bar plus a gap, so the pile never sits on it. */
  const TAB_BAR_PX = 76;

  const shown = new Set<number>();

  $effect(() => {
    const problems = diagnostics.problems;
    const live = new Set(problems.map((problem) => problem.id));

    for (const problem of problems) {
      if (shown.has(problem.id)) continue;
      shown.add(problem.id);
      toast.custom(ProblemCard, {
        id: problem.id,
        // A failure waits to be read: nothing here is worth losing to a four-second timer.
        duration: Number.POSITIVE_INFINITY,
        componentProps: { problem },
        // Swiped away, so the problem is answered for — the pile and the record agree.
        onDismiss: () => diagnostics.dismiss(problem.id),
      });
    }

    for (const id of shown) {
      if (live.has(id)) continue;
      shown.delete(id);
      toast.dismiss(id);
    }
  });
</script>

<!-- Wrapped so the watchdog can hide the whole pile: once reactivity is dead these cards are
     frozen, and its own hand-built card is the only thing on screen worth reading. -->
<div data-problem-toasts>
  <!-- Top-right beside the strip on a desktop; on a phone the pile rises from above the tab bar,
       where it covers a few rows of the week rather than the month and the menu. -->
  <Toaster
    position={viewport.md ? "top-right" : "bottom-center"}
    theme={theme.scheme}
    visibleToasts={3}
    gap={6}
    offset={{ top: "calc(var(--safe-top) + 12px)", right: 12, bottom: 12, left: 12 }}
    mobileOffset={{ top: "calc(var(--safe-top) + 12px)", right: 12, bottom: `calc(var(--safe-bottom) + ${TAB_BAR_PX}px)`, left: 12 }}
    toastOptions={{ unstyled: true, classes: { toast: "w-full" } }}
  />
</div>
