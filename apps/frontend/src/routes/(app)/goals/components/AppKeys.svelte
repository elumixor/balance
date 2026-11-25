<script lang="ts">
  import { Button, Field, Segmented } from "$lib/components";
  import { API_BASE_URL } from "$lib/core/api";
  import { store } from "$lib/core/store.svelte";
  import { slugOf } from "$lib/goals/draft";
  import { createGoalKey, revokeGoalKey } from "$lib/goals/queries";
  import type { Goal, GoalScope } from "$lib/goals/types";
  import { diagnostics } from "$lib/platform/diagnostics.svelte";
  import { KeyRound } from "lucide-svelte";

  /**
   * The keys other apps hold. A goals key reaches goals and nothing else in the account, and only
   * as far as its scopes go, which is what makes it safe to hand to an app somebody else wrote.
   * The secret is shown once, with the request that uses it already written out.
   */
  let { goals }: { goals: Goal[] } = $props();

  const keys = $derived(store.goalKeys.value ?? []);
  const endpoint = $derived(new URL("/api/goals", API_BASE_URL || window.location.origin).toString());

  let naming = $state(false);
  let name = $state("");
  let reach = $state<"progress" | "manage">("progress");
  let creating = $state(false);
  let fresh = $state<{ token: string; name: string } | null>(null);
  let copied = $state<string | null>(null);

  $effect(() => void store.goalKeys.ensure());

  const source = $derived(slugOf(name));
  const example = $derived.by(() => {
    if (!fresh) return "";
    const goal = goals[0];
    const entry = {
      goal: goal?.key ?? "meditation",
      externalId: "sitting-1",
      at: new Date().toISOString(),
      metrics: { [goal?.metric ?? "minutes"]: goal?.target ?? 20 },
    };
    return [
      `curl -X POST ${endpoint}/progress \\`,
      `  -H "Authorization: Bearer ${fresh.token}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${JSON.stringify({ entries: [entry] })}'`,
    ].join("\n");
  });

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
    } catch {
      // A webview without clipboard permission: the button simply doesn't confirm.
    }
  }

  async function create() {
    if (!source || creating) return;
    creating = true;
    const scopes: GoalScope[] = reach === "manage" ? ["read", "progress", "manage"] : ["read", "progress"];
    try {
      const made = await createGoalKey({ name: name.trim(), source, scopes });
      fresh = { token: made.token, name: made.key.name };
      store.goalKeys.set([made.key, ...keys]);
      naming = false;
      name = "";
    } catch (e) {
      diagnostics.report("Goals", e, { title: "Couldn’t make that key" });
    } finally {
      creating = false;
    }
  }

  async function revoke(id: string) {
    store.goalKeys.set(keys.filter((key) => key.id !== id));
    try {
      await revokeGoalKey(id);
    } catch (e) {
      diagnostics.report("Goals", e, { title: "Couldn’t revoke that key" });
    }
    store.goalKeys.invalidate();
  }

  function when(at: string | null) {
    if (!at) return "never used";
    const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
    if (days === 0) return "used today";
    return days === 1 ? "used yesterday" : `used ${days} days ago`;
  }

  const can = (scopes: GoalScope[]) => (scopes.includes("manage") ? "posts progress, makes goals" : scopes.join(", "));
</script>

<section class="space-y-3">
  <div class="space-y-0.5">
    <h2 class="t-heading">Apps</h2>
    <p class="t-label text-fg-muted">
      An app holding a key posts progress here and reads back what is next. A key reaches goals and nothing else.
    </p>
  </div>

  <ul class="divide-y divide-line">
    {#each keys as key (key.id)}
      <li class="flex items-center justify-between gap-3 py-2.5">
        <div class="flex min-w-0 items-center gap-2.5">
          <KeyRound size={15} class="shrink-0 text-fg-faint" />
          <div class="min-w-0">
            <p class="t-label truncate text-fg">{key.name}</p>
            <p class="t-micro truncate text-fg-faint">{can(key.scopes)} · {when(key.lastUsedAt)}</p>
          </div>
        </div>
        <Button label="Revoke" variant="outline" size="sm" onclick={() => void revoke(key.id)} />
      </li>
    {/each}
  </ul>

  {#if naming}
    <div class="space-y-3 rounded-md border border-line p-4">
      <Field
        bind:value={name}
        placeholder="What is holding it: my meditation app"
        autofocus
        onkeydown={(e) => (e.key === "Enter" ? void create() : e.key === "Escape" ? (naming = false) : undefined)}
      />
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "progress", label: "Posts progress" },
            { value: "manage", label: "Also makes goals" },
          ]}
          value={reach}
          onchange={(value) => (reach = value)}
        />
        <div class="flex gap-2">
          <Button label="Cancel" variant="outline" size="sm" onclick={() => (naming = false)} />
          <Button label="Make" size="sm" disabled={!source} loading={creating} onclick={() => void create()} />
        </div>
      </div>
    </div>
  {:else}
    <Button label="Make a key" variant="outline" size="sm" onclick={() => (naming = true)} />
  {/if}

  {#if fresh}
    <div class="space-y-2 rounded-md border border-line bg-surface-alt p-3">
      <p class="t-label text-fg">{fresh.name}: copy it now</p>
      <p class="t-micro text-fg-faint">This is the only time the key is shown. The request below posts one entry with it.</p>
      <code class="t-micro block overflow-x-auto font-mono rounded bg-surface p-2 whitespace-pre text-fg-muted">{example}</code>
      <div class="flex flex-wrap gap-2">
        <Button
          label={copied === "example" ? "Copied" : "Copy request"}
          size="sm"
          onclick={() => void copy("example", example)}
        />
        <Button
          label={copied === "token" ? "Copied" : "Copy the key alone"}
          variant="outline"
          size="sm"
          onclick={() => void copy("token", fresh?.token ?? "")}
        />
        <Button label="Done" variant="outline" size="sm" onclick={() => ((fresh = null), (copied = null))} />
      </div>
    </div>
  {/if}
</section>
