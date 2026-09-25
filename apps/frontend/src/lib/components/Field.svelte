<script lang="ts">
  /**
   * One text input. "boxed" is a form control on its own surface; "bare" sits in a row and only
   * shows its ground once you point at it, so a list of rows stays a list; "bare-sm" is the same
   * thing in a ring callout, where the label has a column's worth of room.
   */
  let {
    value = $bindable(""),
    /** The input itself, for the callers that have to focus or select it. */
    element = $bindable<HTMLInputElement | null>(null),
    /** For fields whose value is derived elsewhere and can't simply be bound. */
    oninput,
    /** For a field whose keys mean something to the row it sits in — Enter to commit, Escape to back out. */
    onkeydown,
    /** For a row that holds a draft while the field is being typed into, and writes it back after. */
    onfocus,
    onblur,
    placeholder,
    type = "text",
    inputmode,
    variant = "boxed",
    numeric = false,
    align = "left",
    ariaLabel,
    autocapitalize = "off",
    class: klass = "",
  }: {
    value: string;
    element?: HTMLInputElement | null;
    oninput?: (value: string) => void;
    onkeydown?: (e: KeyboardEvent) => void;
    onfocus?: () => void;
    onblur?: () => void;
    placeholder?: string;
    type?: "text" | "password";
    inputmode?: "numeric" | "decimal" | "email";
    variant?: "boxed" | "bare" | "bare-sm";
    numeric?: boolean;
    align?: "left" | "center" | "right";
    ariaLabel?: string;
    autocapitalize?: "off" | "sentences";
    class?: string;
  } = $props();
</script>

<input
  bind:this={element}
  bind:value
  oninput={(e) => oninput?.(e.currentTarget.value)}
  {onkeydown}
  {onfocus}
  {onblur}
  {placeholder}
  {type}
  {inputmode}
  {autocapitalize}
  autocomplete="off"
  aria-label={ariaLabel}
  class="w-full {variant === 'boxed' ? 'field-boxed' : variant === 'bare-sm' ? 'field-bare field-sm' : 'field-bare'}
    {numeric ? 't-data' : ''} {align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : ''} {klass}"
/>
