<script lang="ts">
  import { CalendarPlus } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { icsImport } from "$lib/calendar/ics-import.svelte";
  import { isIOSApp } from "$lib/mobile/platform";

  /**
   * A calendar file dropped onto the window, which is how the Mac app and a browser tab are given
   * one — the phone is handed its files by iOS instead (`ics-import.svelte.ts`). Nothing is
   * imported by the drop itself: the file opens the same sheet a shared one opens, with every
   * event in it still to be ticked off.
   *
   * The macOS shell has to be told not to catch the drop first — see `disable_drag_drop_handler`
   * in `src-tauri/src/lib.rs`, without which the webview never sees a file at all.
   */

  /**
   * Dragging over any child element fires `dragleave` on the one being left, so a plain boolean
   * would flicker off the moment the pointer crossed a row. Counting the pair keeps the overlay
   * up until the drag has actually left the window.
   */
  let depth = $state(0);
  const dragging = $derived(depth > 0);

  /**
   * Only a file drag is worth an overlay — dragging an event across the week grid is not. The
   * phone has nowhere to drag a file from, so it is left out of this entirely.
   */
  function carriesFiles(e: DragEvent) {
    return !isIOSApp && (e.dataTransfer?.types.includes("Files") ?? false);
  }

  function onenter(e: DragEvent) {
    if (!carriesFiles(e)) return;
    depth += 1;
  }

  function onleave(e: DragEvent) {
    if (!carriesFiles(e)) return;
    depth = Math.max(0, depth - 1);
  }

  // Without this the browser refuses the drop and opens the file in the tab instead, replacing
  // the app with the raw text of somebody's timetable.
  function onover(e: DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  /**
   * One file per drop: the sheet shows what a file holds, and two files would mean two sheets or
   * a list nobody can tell apart. The first is the one under the pointer.
   */
  function ondrop(e: DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    depth = 0;
    const file = e.dataTransfer?.files?.[0];
    if (file) void icsImport.receiveFile(file);
  }
</script>

<svelte:window ondragenter={onenter} ondragover={onover} ondragleave={onleave} {ondrop} ondragend={() => (depth = 0)} />

{#if dragging && !icsImport.open}
  <div
    class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-overlay-strong p-8
      backdrop-blur-sm"
    transition:fade={{ duration: 100 }}
  >
    <div
      class="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-line-strong bg-surface
        px-10 py-8 shadow-float"
    >
      <CalendarPlus size={28} class="text-fg-muted" />
      <p class="t-heading">Drop a calendar file</p>
      <p class="t-micro text-fg-muted">An .ics file opens as a list of events to import.</p>
    </div>
  </div>
{/if}
