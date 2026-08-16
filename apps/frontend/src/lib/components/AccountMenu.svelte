<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import { clearStore } from "$lib/store.svelte";
  import { LogOut } from "lucide-svelte";
  import Divider from "./Divider.svelte";
  import Popover from "./Popover.svelte";
  import PopoverItem from "./PopoverItem.svelte";

  /**
   * Mobile hangs this off the right edge of a screen header; the side rail off its left.
   * `compact` is for the rail, where it lines up beside the window buttons and wants their
   * scale — a finger needs the bigger one, a cursor doesn't.
   */
  let { align = "end", compact = false }: { align?: "start" | "end"; compact?: boolean } = $props();

  const initial = $derived((auth.email || "?").charAt(0).toUpperCase());

  async function signOut(close: () => void) {
    close();
    await auth.signOut();
    // Whatever is cached belongs to the account that just left.
    clearStore();
    await goto("/sign-in");
  }
</script>

<!-- Who is signed in, and the one action that ends it. Appearance is its own button beside this
     one — three one-word choices are a shorter cycle than they are a menu. -->
<Popover width={230} {align}>
  {#snippet trigger(open: () => void)}
    <button
      type="button"
      onclick={open}
      aria-label="Account"
      title={auth.email}
      class="press-sm t-micro flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-surface-alt text-fg-muted {compact
        ? 'size-[18px]'
        : 'size-7'}"
    >
      {#if auth.avatarUrl}
        <img src={auth.avatarUrl} alt="" class="size-full object-cover" />
      {:else}
        {initial}
      {/if}
    </button>
  {/snippet}

  {#snippet content(close: () => void)}
    {#if auth.email}
      <p class="t-micro truncate px-3 pt-2 pb-2.5 text-fg-faint">{auth.email}</p>
    {/if}
    <Divider />
    <PopoverItem label="Sign out" tone="danger" onclick={() => signOut(close)}>
      {#snippet icon()}
        <LogOut size={15} />
      {/snippet}
    </PopoverItem>
  {/snippet}
</Popover>
