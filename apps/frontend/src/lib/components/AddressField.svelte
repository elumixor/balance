<script lang="ts">
  import { type PlaceSuggestion, suggestPlaces } from "$lib/places";
  import { MapPin } from "lucide-svelte";

  /**
   * An address, typed with Google's help.
   *
   * Nobody should be asked to spell a street the way a routing API wants it: what gets saved here
   * is the address Maps itself answered with, so the journey it feeds can actually be worked out.
   * Free text still commits — a server with no maps key offers nothing, and the field has to stay
   * usable when it does.
   */
  let {
    value = $bindable(""),
    placeholder = "Search an address",
    ariaLabel,
    autofocus = false,
    onpick,
    oncommit,
  }: {
    value: string;
    placeholder?: string;
    ariaLabel: string;
    autofocus?: boolean;
    /** A suggestion was chosen — the address is Google's own spelling of it. */
    onpick?: (suggestion: PlaceSuggestion) => void;
    /** Enter on free text, for a field that has to accept an address nobody suggested. */
    oncommit?: (value: string) => void;
  } = $props();

  /** Long enough that a word is one request rather than six. */
  const ASK_DELAY_MS = 250;

  let input = $state<HTMLInputElement | null>(null);
  let suggestions = $state<PlaceSuggestion[]>([]);
  let open = $state(false);
  let active = $state(0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** One session per field, which is how Google bills a search-then-choose. */
  let session = crypto.randomUUID();
  /** What the list on screen is about, so an answer overtaken by later typing is dropped. */
  let asked = "";

  // Focused on mount only where the field *is* the gesture — a picker that just opened onto it.
  $effect(() => {
    if (autofocus) input?.focus();
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  function type(next: string) {
    value = next;
    open = true;
    active = 0;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void ask(next), ASK_DELAY_MS);
  }

  async function ask(query: string) {
    asked = query;
    try {
      const answer = await suggestPlaces({ query, sessionToken: session });
      // Typed on since this went out: its answer is about a query nobody is looking at.
      if (asked !== query) return;
      suggestions = answer;
    } catch {
      // No suggestions is the same as no maps key here — the field still takes what is typed.
      if (asked === query) suggestions = [];
    }
  }

  function pick(suggestion: PlaceSuggestion) {
    value = suggestion.address;
    open = false;
    suggestions = [];
    // A chosen place closes the billing session; the next word starts a new one.
    session = crypto.randomUUID();
    onpick?.(suggestion);
  }

  function keydown(e: KeyboardEvent) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") oncommit?.(value);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = (active + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = (active - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      open = false;
    }
  }
</script>

<div class="relative">
  <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-faint">
    <MapPin size={15} />
  </span>
  <input
    bind:this={input}
    {placeholder}
    {value}
    oninput={(e) => type(e.currentTarget.value)}
    onkeydown={keydown}
    onfocus={() => (open = suggestions.length > 0)}
    onblur={() => setTimeout(() => (open = false), 120)}
    autocomplete="off"
    autocapitalize="sentences"
    aria-label={ariaLabel}
    aria-expanded={open}
    role="combobox"
    aria-controls="address-suggestions"
    class="t-body h-10 w-full rounded-md border border-line bg-surface pr-3 pl-9 text-fg
      transition-[border-color,box-shadow] duration-150 placeholder:text-fg-faint hover:border-line-strong
      focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none"
  />

  {#if open && suggestions.length > 0}
    <ul
      id="address-suggestions"
      class="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border border-line
        bg-surface py-1 shadow-float"
    >
      {#each suggestions as suggestion, index (suggestion.placeId)}
        <li>
          <button
            type="button"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => pick(suggestion)}
            onpointerenter={() => (active = index)}
            class="block w-full px-3 py-2 text-left {index === active ? 'bg-surface-alt' : ''}"
          >
            <span class="t-label block truncate text-fg">{suggestion.name}</span>
            {#if suggestion.detail}
              <span class="t-micro block truncate text-fg-faint">{suggestion.detail}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
