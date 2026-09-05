<script lang="ts">
  /** Field's multi-line twin, for the few places where prose is the value — event notes today. */
  let {
    value = $bindable(""),
    /** For callers that need to react to every keystroke, not only to the bound value. */
    oninput,
    placeholder,
    rows = 3,
    ariaLabel,
    /** "bare" is the notes on a card: no ground until pointed at, the way the card's fields are. */
    variant = "boxed",
    class: klass = "",
  }: {
    value: string;
    oninput?: (value: string) => void;
    placeholder?: string;
    rows?: number;
    ariaLabel?: string;
    variant?: "boxed" | "bare";
    class?: string;
  } = $props();
</script>

<textarea
  bind:value
  oninput={(e) => oninput?.(e.currentTarget.value)}
  {placeholder}
  {rows}
  aria-label={ariaLabel}
  class="h-auto w-full resize-y {variant === 'bare' ? 'field-bare py-1.5' : 'field-boxed py-2'} {klass}"
></textarea>
