<script lang="ts">
  /** Field's multi-line twin, for the few places where prose is the value — event notes today. */
  let {
    value = $bindable(""),
    /** For callers that need to react to every keystroke, not only to the bound value. */
    oninput,
    placeholder,
    rows = 3,
    ariaLabel,
    class: klass = "",
  }: {
    value: string;
    oninput?: (value: string) => void;
    placeholder?: string;
    rows?: number;
    ariaLabel?: string;
    class?: string;
  } = $props();
</script>

<textarea
  bind:value
  oninput={(e) => oninput?.(e.currentTarget.value)}
  {placeholder}
  {rows}
  aria-label={ariaLabel}
  class="t-body w-full resize-y rounded-md border border-transparent bg-surface-alt px-3 py-2.5 text-fg
    placeholder:text-fg-faint focus:border-line-strong {klass}"
></textarea>
