<script lang="ts">
  import { Button, Field } from "$lib/components";
  import { API_BASE_URL } from "$lib/core/api";
  import { store } from "$lib/core/store.svelte";
  import { createMcpKey, revokeMcpKey } from "$lib/mcp/queries";
  import { Bot, KeyRound, Plug } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";

  /**
   * Letting an assistant read the week and write to it.
   *
   * The app speaks MCP at `/mcp`, and what an assistant holds to get in is a key made here. It is
   * shown once — only its hash is kept — so the box it lands in is the one place it will ever be,
   * and the command that uses it is written out with the key already in it: the alternative is
   * somebody copying a token into a shell by hand at the exact moment they cannot see it twice.
   *
   * A key is the whole account, which is why the list says when each was last used: that is the
   * only way to tell a key with a terminal behind it from one somebody forgot they made.
   */
  const keys = $derived(store.mcpKeys.value ?? []);
  const endpoint = $derived(new URL("/mcp", API_BASE_URL || window.location.origin).toString());

  let naming = $state(false);
  let name = $state("");
  let creating = $state(false);
  /** The secret, for as long as the panel stays open on it. */
  let fresh = $state<{ token: string; name: string } | null>(null);
  /** Which button last confirmed a copy, so the word under the pointer changes and nothing else. */
  let copied = $state<string | null>(null);

  $effect(() => void store.mcpKeys.ensure());

  const command = $derived(
    fresh
      ? `claude mcp add --transport http balance ${endpoint} --header "Authorization: Bearer ${fresh.token}"`
      : "",
  );

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
    } catch {
      // A webview without clipboard permission: the button simply doesn't confirm.
    }
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    creating = true;
    try {
      const made = await createMcpKey(trimmed);
      fresh = { token: made.token, name: made.key.name };
      store.mcpKeys.set([made.key, ...keys]);
      naming = false;
      name = "";
    } finally {
      creating = false;
    }
  }

  async function revoke(id: string) {
    store.mcpKeys.set(keys.filter((key) => key.id !== id));
    await revokeMcpKey(id);
    store.mcpKeys.invalidate();
  }

  function when(at: string | null) {
    if (!at) return "Never used.";
    const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
    if (days === 0) return "Used today.";
    return days === 1 ? "Used yesterday." : `Used ${days} days ago.`;
  }
</script>

<SettingsGroup title="Assistants">
  <div class="space-y-1">
    <SettingRow
      icon={Plug}
      label="Balance speaks MCP"
      note="An assistant holding a key can read your week, your spheres and your projects, and write blocks back."
      flat
    />
    <SettingRow icon={Bot} label="Server address" note={endpoint} flat>
      <Button
        label={copied === "endpoint" ? "Copied" : "Copy"}
        variant="outline"
        size="sm"
        onclick={() => void copy("endpoint", endpoint)}
      />
    </SettingRow>

    {#each keys as key (key.id)}
      <SettingRow icon={KeyRound} label={key.name} note={when(key.lastUsedAt)} flat>
        <Button label="Revoke" variant="outline" size="sm" onclick={() => void revoke(key.id)} />
      </SettingRow>
    {/each}

    {#if naming}
      <div class="flex items-center gap-2 px-1.5 py-1">
        <Field
          bind:value={name}
          placeholder="What is holding it — Claude on my laptop"
          onkeydown={(e) => (e.key === "Enter" ? void create() : e.key === "Escape" ? (naming = false) : undefined)}
        />
        <Button label="Make" size="sm" loading={creating} onclick={() => void create()} />
        <Button label="Cancel" variant="outline" size="sm" onclick={() => (naming = false)} />
      </div>
    {:else}
      <SettingRow label="New key" note="Made once, shown once." flat>
        <Button label="Make a key" size="sm" onclick={() => (naming = true)} />
      </SettingRow>
    {/if}

    {#if fresh}
      <div class="mt-2 space-y-2 rounded-md border border-line bg-surface-alt p-3">
        <p class="t-label text-fg">{fresh.name} — copy it now</p>
        <p class="t-micro text-fg-faint">
          This is the only time the key is shown. Run the line below to add Balance to Claude Code;
          any other MCP client takes the same address and the same bearer key.
        </p>
        <code class="t-micro block overflow-x-auto rounded bg-surface p-2 whitespace-pre text-fg-muted">{command}</code>
        <div class="flex gap-2">
          <Button
            label={copied === "command" ? "Copied" : "Copy command"}
            size="sm"
            onclick={() => void copy("command", command)}
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
  </div>
</SettingsGroup>
