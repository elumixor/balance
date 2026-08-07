<script lang="ts">
  /** Field's multi-line twin, for the few places where prose is the value — event notes today. */
  let {
    value = $bindable(""),
    placeholder,
    rows = 3,
    ariaLabel,
    class: klass = "",
  }: {
    value: string;
    placeholder?: string;
    rows?: number;
    ariaLabel?: string;
    class?: string;
  } = $props();
</script>

<textarea
  bind:value
  {placeholder}
  {rows}
  aria-label={ariaLabel}
  class="t-body w-full resize-y rounded-md border border-transparent bg-surface-alt px-3 py-2.5 text-fg
    placeholder:text-fg-faint focus:border-line-strong {klass}"
></textarea>
