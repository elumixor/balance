<script lang="ts">
  import { Field, IconGrid, Popover } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Project, ProjectField } from "$lib/projects/types";
  import { iconFor } from "$lib/ui/icons";
  import { AlignLeft, Calendar, Hash, Link as LinkIcon, Plus, X } from "lucide-svelte";
  import PropertyRow from "./PropertyRow.svelte";

  /**
   * The panel beside a project's name: whatever it says about itself — a start date, a length, a
   * dashboard. The app has no opinion about which fields a project has; a mirrored one carries
   * whatever its Notion database defines, and a local one carries what somebody typed.
   *
   * A field wears an icon of its own, because a column of identical glyphs is a column nobody
   * reads. Pressing the icon is where the kind of answer the field takes is chosen too — the two
   * belong together, and neither is worth a row of its own.
   */
  let { project }: { project: Project } = $props();

  const TYPES: { value: ProjectField["type"]; label: string; icon: typeof AlignLeft }[] = [
    { value: "text", label: "Text", icon: AlignLeft },
    { value: "date", label: "Date", icon: Calendar },
    { value: "number", label: "Number", icon: Hash },
    { value: "url", label: "Link", icon: LinkIcon },
  ];
  const TYPE_ICONS: Record<ProjectField["type"], string> = {
    text: "align-left",
    date: "calendar",
    number: "hash",
    url: "link",
  };

  function write(field: ProjectField, patch: Partial<ProjectField>) {
    data.writeField(project, { ...field, ...patch });
  }

  function add() {
    data.writeField(project, {
      id: crypto.randomUUID(),
      icon: TYPE_ICONS.text,
      label: "",
      type: "text",
      value: "",
    });
  }
</script>

<dl class="space-y-0.5">
  {#each project.fields as field (field.id)}
    {@const Icon = iconFor(field.icon)}
    <PropertyRow>
      {#snippet icon()}
        <Popover width={260} align="start">
          {#snippet trigger(open)}
            <button type="button" onclick={open} aria-label="Change what {field.label || 'this field'} looks like and holds" class="bare-button size-6">
              <Icon size={13} />
            </button>
          {/snippet}
          {#snippet content()}
            <div class="flex flex-col gap-2 p-2">
              <div class="flex gap-1">
                {#each TYPES as option (option.value)}
                  {@const TypeIcon = option.icon}
                  <button
                    type="button"
                    aria-pressed={field.type === option.value}
                    onclick={() =>
                      write(field, {
                        type: option.value,
                        icon: field.icon === TYPE_ICONS[field.type] ? TYPE_ICONS[option.value] : field.icon,
                      })}
                    class="press-sm t-micro flex flex-1 items-center justify-center gap-1 rounded-md border py-1
                      {field.type === option.value ? 'border-ink text-fg' : 'border-line text-fg-faint'}"
                  >
                    <TypeIcon size={12} />
                    {option.label}
                  </button>
                {/each}
              </div>
              <IconGrid icon={field.icon} onpick={(name) => write(field, { icon: name })} />
            </div>
          {/snippet}
        </Popover>
      {/snippet}

      {#snippet name()}
        <Field
          value={field.label}
          variant="bare"
          placeholder="Field"
          ariaLabel="Field name"
          oninput={(label) => write(field, { label })}
          class="field-sm t-micro"
        />
      {/snippet}

      {#if field.type === "url" && field.value}
        <a
          href={field.value}
          target="_blank"
          rel="noreferrer"
          class="t-micro truncate px-2 text-fg underline-offset-2 hover:underline"
        >
          {field.value.replace(/^https?:\/\//, "")}
        </a>
      {:else}
        <Field
          value={field.value}
          variant="bare"
          align="right"
          placeholder="—"
          ariaLabel={field.label || "Value"}
          numeric={field.type === "number"}
          oninput={(value) => write(field, { value })}
          class="field-sm t-micro"
        />
      {/if}
      <button
        type="button"
        onclick={() => data.removeField(project, field.id)}
        aria-label="Remove field"
        class="bare-button size-5 opacity-0 group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </PropertyRow>
  {/each}

  <button type="button" onclick={add} class="bare-button t-micro flex items-center gap-1.5 rounded-md px-1 py-1">
    <Plus size={12} />
    Add field
  </button>
</dl>
