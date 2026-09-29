<script lang="ts">
  import { Dot, NotionMark, NumberField, Popover, PopoverItem } from "$lib/components";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Project, ProjectStatus } from "$lib/projects/types";
  import { restColor } from "$lib/ui/colors";
  import { ChevronDown, CircleDot, Clock, ExternalLink } from "lucide-svelte";
  import MembersRow from "./MembersRow.svelte";
  import NotionLinkDialog from "./NotionLinkDialog.svelte";

  /**
   * What a project is, beyond its name, as one line of chips: which sphere its hours come out of,
   * how many a week it claims, where it stands, who is in it, and where its tasks come from. Each
   * is a thing the app understands and draws in its own way — a sphere is a colour, a claim is a
   * number of hours, the Notion link is a database — rather than rows of a generic panel.
   */
  let { project }: { project: Project } = $props();

  const STATUSES: { value: ProjectStatus; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "done", label: "Done" },
    { value: "dropped", label: "Dropped" },
  ];

  const sphere = $derived(data.categoryById.get(project.categoryId) ?? null);
  const status = $derived(STATUSES.find((one) => one.value === project.status) ?? STATUSES[0]);

  let linking = $state(false);
</script>

<div class="flex flex-wrap items-center gap-1.5">
  <!-- A sub-project's hours land where its parent's do, so only the top of a tree picks a sphere. -->
  {#if project.parentId}
    <span class="chip-outline pointer-events-none">
      <Dot color={sphere?.color ?? restColor} size={7} />
      {sphere?.name || "Unnamed sphere"}
    </span>
  {:else}
    <Popover width={200} align="start">
      {#snippet trigger(open)}
        <button type="button" onclick={open} aria-label="Sphere" class="chip-outline">
          <Dot color={sphere?.color ?? restColor} size={7} />
          {sphere?.name || "Unnamed sphere"}
          <ChevronDown size={12} class="text-fg-faint" />
        </button>
      {/snippet}
      {#snippet content(close)}
        {#each data.spheres as one (one.id)}
          <PopoverItem
            label={one.name || "Unnamed sphere"}
            selected={one.id === project.categoryId}
            onclick={() => {
              data.setSphere(project, one.id);
              close();
            }}
          >
            {#snippet icon()}<Dot color={one.color} size={8} />{/snippet}
          </PopoverItem>
        {/each}
      {/snippet}
    </Popover>
  {/if}

  <span class="chip-outline gap-0 overflow-hidden pr-0">
    <Clock size={12} />
    <NumberField
      size="sm"
      width="w-7"
      value={project.hoursPerWeek}
      unit="h/wk"
      ariaLabel="Hours a week"
      onchange={(hoursPerWeek) => data.update(project.id, { hoursPerWeek })}
    />
  </span>

  <Popover width={160} align="start">
    {#snippet trigger(open)}
      <button type="button" onclick={open} aria-label="Status" class="chip-outline">
        <CircleDot size={12} />
        {status.label}
        <ChevronDown size={12} class="text-fg-faint" />
      </button>
    {/snippet}
    {#snippet content(close)}
      {#each STATUSES as option (option.value)}
        <PopoverItem
          label={option.label}
          selected={option.value === project.status}
          onclick={() => {
            data.setStatus(project, option.value);
            close();
          }}
        />
      {/each}
    {/snippet}
  </Popover>

  <span class="inline-flex">
    <button type="button" onclick={() => (linking = true)} class="chip-outline {project.notionUrl ? 'rounded-r-none' : ''}">
      <NotionMark size={12} />
      {project.notionTasksName ?? (project.notionConnectionId ? "Notion" : "Link Notion")}
    </button>
    {#if project.notionUrl}
      <a
        href={project.notionUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Open in Notion"
        class="chip-outline -ml-px rounded-l-none px-1.5"
      >
        <ExternalLink size={12} />
      </a>
    {/if}
  </span>

  <MembersRow {project} />
</div>

<NotionLinkDialog {project} open={linking} onclose={() => (linking = false)} />
