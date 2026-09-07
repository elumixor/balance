<script lang="ts">
  import { desktopUpdates } from "$lib/desktop/updates.svelte";
  import { toast } from "svelte-sonner";
  import UpdateCard from "./UpdateCard.svelte";

  /**
   * Puts one card in the pile when an update has been installed and is waiting on a restart.
   *
   * It shares `ProblemToasts`' Toaster rather than owning one — two piles in one corner would
   * climb over each other — and draws nothing itself. Dismissing it is "later": the menu bar and
   * settings keep offering the restart, and the card is not shown again for the same version.
   */
  const ID = "desktop-update";

  $effect(() => {
    const version = desktopUpdates.stage === "ready" ? desktopUpdates.installed : null;
    if (!version) return;
    toast.custom(UpdateCard, {
      id: ID,
      duration: Number.POSITIVE_INFINITY,
      componentProps: { id: ID, version },
    });
  });
</script>
