<script lang="ts">
  /**
   * One text input, three jobs. "boxed" is a form control on its own surface; "inline" sits in a
   * row and only draws its box once you point at it, so a list of rows stays a list; "inline-sm"
   * is the same thing in a ring callout, where the label has a column's worth of room.
   *
   * Both share the same focus treatment — the border firms up and a soft ring lands outside it,
   * replacing the global outline so a click and a tab key look the same.
   */
  let {
    value = $bindable(""),
    /** For fields whose value is derived elsewhere and can't simply be bound. */
    oninput,
    placeholder,
    type = "text",
    inputmode,
    variant = "boxed",
    mono = false,
    align = "left",
    ariaLabel,
    autocapitalize = "off",
    class: klass = "",
  }: {
    value: string;
    oninput?: (value: string) => void;
    placeholder?: string;
    type?: "text" | "password";
    inputmode?: "numeric" | "decimal" | "email";
    variant?: "boxed" | "inline" | "inline-sm";
    mono?: boolean;
    align?: "left" | "center" | "right";
    ariaLabel?: string;
    autocapitalize?: "off" | "sentences";
    class?: string;
  } = $props();
</script>

<input
  bind:value
  oninput={(e) => oninput?.(e.currentTarget.value)}
  {placeholder}
  {type}
  {inputmode}
  {autocapitalize}
  autocomplete="off"
  aria-label={ariaLabel}
  class="{mono ? 't-data' : variant === 'inline-sm' ? 't-label' : 't-body'} w-full rounded-md border text-fg
    transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-fg-faint
    focus:border-line-strong focus:ring-2 focus:ring-fg/10 focus:outline-none
    {variant === 'boxed'
    ? 'h-10 border-line bg-surface px-3 hover:border-line-strong'
    : variant === 'inline-sm'
      ? 'h-7 border-transparent px-1 hover:border-line'
      : 'h-9 border-transparent px-2 hover:border-line'}
    {align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : ''} {klass}"
/>
