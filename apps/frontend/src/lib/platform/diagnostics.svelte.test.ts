import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { diagnostics } from "./diagnostics.svelte";

describe("dismiss", () => {
  /**
   * The layout takes the sync's cards back from an `$effect` every time the sync is fine. Reading
   * the list it wrote made that effect run itself until Svelte tore down every effect in the app.
   */
  it("can run inside an effect without re-running it", () => {
    let runs = 0;
    const stop = $effect.root(() => {
      $effect(() => {
        runs += 1;
        diagnostics.dismiss();
        diagnostics.dismiss(undefined);
      });
    });
    flushSync();
    stop();
    expect(runs).toBe(1);
  });

  it("closes only the cards it names", () => {
    const keep = diagnostics.report("Kept", new Error("still broken"));
    const close = diagnostics.report("Closed", new Error("recovered"));
    const stop = $effect.root(() => {
      $effect(() => diagnostics.dismiss(close));
    });
    flushSync();
    stop();
    const ids = diagnostics.problems.map((problem) => problem.id);
    expect(ids).toContain(keep);
    expect(ids).not.toContain(close);
  });
});
