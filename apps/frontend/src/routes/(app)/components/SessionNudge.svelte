<script lang="ts">
  import { page } from "$app/state";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { toast } from "svelte-sonner";
  import SessionNudgeCard from "./SessionNudgeCard.svelte";

  /**
   * The ask, put where everything the app says goes: the pile in the corner that `ProblemToasts`
   * draws. It used to be its own fixed card, which meant two things could occupy the same corner
   * and neither knew about the other — the nudge sat under the failures, or over them.
   *
   * So this draws nothing itself. `sessionNudge` stays the truth about whether a sitting is owed;
   * this only puts a card in the pile while it is, and takes it off the moment it isn't.
   */
  const showing = $derived(sessionNudge.pending && !page.url.pathname.startsWith("/session"));

  const ID = "session-nudge";
  let shown = false;

  $effect(() => {
    if (showing === shown) return;
    shown = showing;
    if (!showing) {
      toast.dismiss(ID);
      return;
    }
    toast.custom(SessionNudgeCard, {
      id: ID,
      // An ask waits to be answered: it goes when it is taken, waved away, or no longer owed.
      duration: Number.POSITIVE_INFINITY,
      // Swiped away, so the ask is moved rather than settled — the pile and the snooze agree.
      // Sonner reports a programmatic removal here too, so the snooze is only set while the ask
      // is still standing: taking the card off because the sitting is no longer owed, or because
      // the session screen is open, is not somebody saying "not now".
      onDismiss: () => {
        if (showing) sessionNudge.dismiss();
      },
    });
  });
</script>
