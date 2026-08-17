<script lang="ts">
  import { iconFor } from "$lib/icons";
  import Arc from "./ring/Arc.svelte";

  /**
   * A category's icon, ringed by how much of its planned week is spent — the same arc the week
   * dial draws, just one segment instead of many. Past 100% the ring goes the same red a bar does.
   */
  let {
    icon,
    color,
    ratio,
    size = 38,
    thickness = 3,
  }: { icon: string; color: string; ratio: number; size?: number; thickness?: number } = $props();

  const c = $derived(size / 2);
  const r = $derived(c - thickness / 2);
  const sweep = $derived(Math.max(0, Math.min(1, ratio || 0)));
  const over = $derived(ratio > 1);
  const Icon = $derived(iconFor(icon));
</script>

<div class="relative" role="img" aria-label="{Math.round(sweep * 100)}% of planned" style="width:{size}px;height:{size}px">
  <svg width={size} height={size}>
    <circle cx={c} cy={c} {r} fill="none" stroke="var(--surface-alt)" stroke-width={thickness} />
    <Arc cx={c} cy={c} {r} {thickness} color={over ? "var(--danger)" : color} start={0} {sweep} delay={0} />
  </svg>
  <span
    class="pointer-events-none absolute inset-0 flex items-center justify-center"
    style="color:{over ? 'var(--danger)' : color}"
  >
    <Icon size={Math.round(size * 0.42)} strokeWidth={2} />
  </span>
</div>
