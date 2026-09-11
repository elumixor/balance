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

  /**
   * The box is the text: it grows to what is in it and has no handle to drag. A corner grip on a
   * field that already sizes itself is a control that only makes the layout worse.
   */
  function grow(node: HTMLTextAreaElement, current: string) {
    const least = node.clientHeight;
    const fit = () => {
      node.style.height = "auto";
      node.style.height = `${Math.max(node.scrollHeight, least)}px`;
    };
    fit();
    node.addEventListener("input", fit);
    return {
      update: (next: string) => {
        void next;
        fit();
      },
      destroy: () => node.removeEventListener("input", fit),
    };
  }
</script>

<textarea
  bind:value
  oninput={(e) => oninput?.(e.currentTarget.value)}
  {placeholder}
  {rows}
  aria-label={ariaLabel}
  use:grow={value}
  class="w-full resize-none overflow-hidden {variant === 'bare' ? 'field-bare py-1.5' : 'field-boxed py-2'} {klass}"
></textarea>
