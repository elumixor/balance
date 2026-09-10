<script lang="ts">
  import { Field } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Project, ProjectField } from "$lib/projects/types";
  import { AlignLeft, Calendar, Hash, Link as LinkIcon, Plus, X } from "lucide-svelte";

  /**
   * The panel beside a project's name: whatever it says about itself — a start date, a length, a
   * dashboard. The app has no opinion about which fields a project has; a mirrored one carries
   * whatever its Notion database defines, and a local one carries what somebody typed.
   */
  let { project }: { project: Project } = $props();

  const ICONS = { text: AlignLeft, date: Calendar, number: Hash, url: LinkIcon } as const;

  function write(field: ProjectField, value: string) {
    data.writeField(project, { ...field, value });
  }

  function rename(field: ProjectField, label: string) {
    data.writeField(project, { ...field, label });
  }

  function add() {
    data.writeField(project, {
      id: crypto.randomUUID(),
      icon: "align-left",
      label: "",
      type: "text",
      value: "",
    });
  }
</script>

<dl class="space-y-1">
  {#each project.fields as field (field.id)}
    {@const Icon = ICONS[field.type]}
    <div class="group flex items-center gap-2">
      <dt class="flex min-w-0 flex-1 items-center gap-2 text-fg-muted">
        <Icon size={13} class="shrink-0" />
        <Field
          value={field.label}
          variant="bare"
          placeholder="Field"
          ariaLabel="Field name"
          oninput={(value) => rename(field, value)}
          class="t-micro"
        />
      </dt>
      <dd class="flex min-w-0 flex-1 items-center gap-1">
        {#if field.type === "url" && field.value}
          <a href={field.value} target="_blank" rel="noreferrer" class="t-micro truncate text-fg underline-offset-2 hover:underline">
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
            oninput={(value) => write(field, value)}
            class="t-micro"
          />
        {/if}
        <button
          type="button"
          onclick={() => data.removeField(project, field.id)}
          aria-label="Remove field"
          class="press hoverable rounded-sm p-0.5 text-fg-faint opacity-0 group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      </dd>
    </div>
  {/each}

  <button type="button" onclick={add} class="press hoverable t-micro flex items-center gap-1.5 rounded-md py-1 text-fg-faint">
    <Plus size={12} />
    Add field
  </button>
</dl>
