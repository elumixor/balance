<script lang="ts">
  /**
   * One text input, three jobs. "boxed" is a form control on its own surface; "inline" sits in a
   * row and only shows its ground once you point at it, so a list of rows stays a list;
   * "inline-sm" is the same thing in a ring callout, where the label has a column's worth of room.
   */
  let {
    value = $bindable(""),
    /** The input itself, for the callers that have to focus or select it. */
    element = $bindable<HTMLInputElement | null>(null),
    /** For fields whose value is derived elsewhere and can't simply be bound. */
    oninput,
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
    placeholder?: string;
    type?: "text" | "password";
    inputmode?: "numeric" | "decimal" | "email";
    variant?: "boxed" | "inline" | "inline-sm";
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
  {placeholder}
  {type}
  {inputmode}
  {autocapitalize}
  autocomplete="off"
  aria-label={ariaLabel}
  class="{numeric ? 't-data' : variant === 'boxed' ? 't-body' : 't-label'} w-full text-fg
    {variant === 'boxed'
    ? 'h-10 rounded-md border border-line bg-surface px-3 transition-[border-color,box-shadow] duration-150 placeholder:text-fg-faint hover:border-line-strong focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none'
    : variant === 'inline-sm'
      ? 'field-bare h-7 px-1'
      : 'field-bare'}
    {align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : ''} {klass}"
/>
