<script lang="ts">
  import { withAlpha } from "$lib/colors";
  import { iconFor } from "$lib/icons";

  /**
   * A category, drawn: its icon in its own colour, on a tint of the same colour. One component so
   * a category looks the same wherever it turns up — the plan, a picker, a badge on an event.
   */
  let {
    icon,
    color,
    size = 32,
  }: {
    icon: string;
    color: string;
    size?: number;
  } = $props();

  const Icon = $derived(iconFor(icon));
</script>

<span
  class="flex shrink-0 items-center justify-center rounded-md"
  style="width:{size}px;height:{size}px;background:{withAlpha(color, 0.16)};color:{color}"
>
  <Icon size={Math.round(size * 0.56)} strokeWidth={2} />
</span>
