<script lang="ts">
  import { Avatar, Avatars, PersonField, Popover } from "$lib/components";
  import type { Person } from "$lib/people/types";
  import { projectsData as data } from "$lib/projects/projects-data.svelte";
  import type { Project } from "$lib/projects/types";
  import { UserRoundPlus, X } from "lucide-svelte";

  /**
   * Who has this project — the faces under its name, and the panel they are chosen in. The way in
   * is one more circle at the end of the row wearing a person rather than a bare plus, so a row
   * with nobody on it yet still says what it is asking for. Inside, the members already on it
   * each with a cross, and under them the app's one person field: everyone the account knows,
   * by name or address, and a name nobody matches becomes somebody new.
   */
  let { project }: { project: Project } = $props();

  const members = $derived(
    project.memberIds.map((id) => data.personById.get(id)).filter((one): one is Person => Boolean(one)),
  );

  function add(person: Person) {
    if (!project.memberIds.includes(person.id)) data.toggleMember(project, person.id);
  }
</script>

<Popover width={260}>
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
    <div class="space-y-0.5 p-1">
      {#each members as person (person.id)}
        <div class="group flex items-center gap-2 rounded-md px-2 py-1">
          <Avatar {person} size={18} />
          <span class="t-micro min-w-0 flex-1 truncate text-fg">{person.name}</span>
          <button
            type="button"
            aria-label="Remove {person.name}"
            onclick={() => data.toggleMember(project, person.id)}
            class="press-sm shrink-0 rounded p-0.5 text-fg-faint opacity-0 group-hover:opacity-100 hover:text-fg
              focus-visible:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      {/each}
      <div class="px-1">
        <PersonField taken={project.memberIds} placeholder="Add someone" autofocus onpick={add} />
      </div>
    </div>
  {/snippet}
</Popover>
