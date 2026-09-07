<script lang="ts">
  import { Switch } from "$lib/components";
  import type { Icon as IconType } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";

  /** A setting that is on or off: a row whose control is a switch. The row hands its press on. */
  let {
    icon,
    label,
    checked,
    note,
    disabled = false,
    onchange,
  }: {
    icon?: typeof IconType;
    label: string;
    checked: boolean;
    note?: string;
    disabled?: boolean;
    onchange: (checked: boolean) => void;
  } = $props();
</script>

<SettingRow {icon} {label} {note} {disabled}>
  <Switch {checked} {label} {disabled} {onchange} />
</SettingRow>
