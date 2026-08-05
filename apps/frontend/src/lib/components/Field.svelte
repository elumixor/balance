<script lang="ts">
  /** "inline" blends into a row; "boxed" sits on its own filled surface. */
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
    variant?: "boxed" | "inline";
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
  class="{mono ? 't-data' : 't-body'} w-full rounded-md border border-transparent py-2.5 text-fg
    placeholder:text-fg-faint focus:border-line-strong
    {variant === 'boxed' ? 'bg-surface-alt px-3' : 'px-1'}
    {align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : ''} {klass}"
/>
