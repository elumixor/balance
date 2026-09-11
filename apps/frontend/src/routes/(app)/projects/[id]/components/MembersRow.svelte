<script lang="ts">
  import { Avatars, Field, Popover } from "$lib/components";
  import { people } from "$lib/core/synced.svelte";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Person, Project } from "$lib/projects/types";
  import { UserRoundPlus } from "lucide-svelte";

  /**
   * Who has this project — the faces under its name, and the list they are chosen from. The way in
   * is one more circle at the end of the row wearing a person rather than a bare plus, so a row
   * with nobody on it yet still says what it is asking for.
   */
  let { project }: { project: Project } = $props();

  const members = $derived(
    project.memberIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one)),
  );

  let name = $state("");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const created = data.createPerson(trimmed);
    data.toggleMember(project, created.id);
    name = "";
  }
</script>

<Popover width={240}>
  {#snippet trigger(toggle)}
    <button
      type="button"
      onclick={toggle}
      aria-label="Who this project is shared with"
      class="press flex items-center rounded-full p-0.5"
    >
      <Avatars people={members} size={24} />
      <span
        class="flex size-6 items-center justify-center rounded-full border border-line-strong border-dashed
          bg-surface text-fg-faint {members.length > 0 ? '-ml-1.5' : ''}"
      >
        <UserRoundPlus size={13} />
      </span>
    </button>
  {/snippet}

  {#snippet content()}
    <div class="space-y-1 p-1">
      {#each people.all as person (person.id)}
        {@const on = project.memberIds.includes(person.id)}
        <button
          type="button"
          onclick={() => data.toggleMember(project, person.id)}
          class="press hoverable flex w-full items-center gap-2 rounded-md px-2 py-1 text-left"
        >
          <span class="size-2.5 rounded-full" style="background:{person.color}"></span>
          <span class="t-micro flex-1 truncate {on ? 'text-fg' : 'text-fg-muted'}">{person.name}</span>
          {#if on}<span class="t-micro text-fg-faint">on</span>{/if}
        </button>
      {/each}
      <Field
        bind:value={name}
        variant="bare-sm"
        placeholder="Add someone"
        ariaLabel="Add someone"
        onkeydown={(e) => {
          if (e.key === "Enter") add();
        }}
      />
    </div>
  {/snippet}
</Popover>
