<script lang="ts">
  import { type PlaceSuggestion, suggestPlaces } from "$lib/travel/places";
  import ComboField, { type ComboOption } from "./ComboField.svelte";
  import { MapPin } from "lucide-svelte";

  /**
   * An address, typed with Google's help.
   *
   * Nobody should be asked to spell a street the way a routing API wants it: what gets saved here
   * is the address Maps itself answered with, so the journey it feeds can actually be worked out.
   * Free text still commits — a server with no maps key offers nothing, and the field has to stay
   * usable when it does. The field itself is a ComboField; this only knows where its rows come from.
   */
  let {
    value = $bindable(""),
    placeholder = "Search an address",
    ariaLabel,
    autofocus = false,
    onpick,
    oncommit,
    /** "bare" is the field in a card row, which already carries the pin: no box, no icon. */
    variant = "boxed",
  }: {
    value: string;
    placeholder?: string;
    ariaLabel: string;
    autofocus?: boolean;
    /** A suggestion was chosen — the address is Google's own spelling of it. */
    onpick?: (suggestion: PlaceSuggestion) => void;
    /** Enter on free text, for a field that has to accept an address nobody suggested. */
    oncommit?: (value: string) => void;
    variant?: "boxed" | "bare";
  } = $props();

  /** Long enough that a word is one request rather than six. */
  const ASK_DELAY_MS = 250;

  let suggestions = $state<PlaceSuggestion[]>([]);
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** One session per field, which is how Google bills a search-then-choose. */
  let session = crypto.randomUUID();
  /** What the list on screen is about, so an answer overtaken by later typing is dropped. */
  let asked = "";

  const options = $derived(
    suggestions.map((one): ComboOption<PlaceSuggestion> => ({ key: one.placeId, label: one.name, hint: one.detail, value: one })),
  );

  $effect(() => () => {
    if (timer) clearTimeout(timer);
  });

  function type(next: string) {
    value = next;
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
    suggestions = [];
    // A chosen place closes the billing session; the next word starts a new one.
    session = crypto.randomUUID();
    onpick?.(suggestion);
  }
</script>

<div class="relative">
  {#if variant === "boxed"}
    <span class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-fg-faint">
      <MapPin size={15} />
    </span>
  {/if}
  <ComboField
    bind:value={() => value, type}
    {options}
    {placeholder}
    {ariaLabel}
    {autofocus}
    {variant}
    autocapitalize="sentences"
    width={300}
    class={variant === "boxed" ? "pl-9" : ""}
    onpick={(option) => pick(option.value)}
    onfree={(text) => oncommit?.(text)}
  >
    {#snippet row(option)}
      <span class="min-w-0 flex-1">
        <span class="block truncate">{option.label}</span>
        {#if option.hint}
          <span class="t-micro block truncate text-fg-faint">{option.hint}</span>
        {/if}
      </span>
    {/snippet}
  </ComboField>
</div>
