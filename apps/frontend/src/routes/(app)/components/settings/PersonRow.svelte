<script lang="ts">
  import { Avatar, Field, Tooltip } from "$lib/components";
  import { imageFileIn } from "$lib/people/avatar";
  import { peopleDirectory } from "$lib/people/directory.svelte";
  import type { Person } from "$lib/people/types";
  import { CloudDownload, Trash2 } from "lucide-svelte";

  /**
   * One person on the list, every part of them editable where it is drawn: the face is a button
   * that opens a file picker and a target a picture can be dropped on, the name and the address
   * are fields, and the cloud asks Google's address book and Gravatar for whatever they know.
   *
   * What is typed is held here until the field is left. Every keystroke is written through the
   * queue, and the record comes back trimmed and re-rendered — which, bound straight to the
   * field, ate the space somebody had just typed between a first name and a last.
   */
  let { person }: { person: Person } = $props();

  let name = $state(person.name);
  let email = $state(person.email ?? "");
  let editing = $state<"name" | "email" | null>(null);

  // A record that moved under the row — a lookup landing, an undo — replaces the draft, unless
  // the draft is the thing being typed.
  $effect(() => {
    const given = person.name;
    if (editing !== "name") name = given;
  });
  $effect(() => {
    const given = person.email ?? "";
    if (editing !== "email") email = given;
  });

  let picker = $state<HTMLInputElement>();
  let over = $state(false);
  let looking = $state(false);

  function chooseFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared straight away, or choosing the same file twice in a row fires no event the second time.
    input.value = "";
    if (file) void peopleDirectory.setAvatar(person.id, file);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    over = false;
    const file = imageFileIn(e.dataTransfer);
    if (file) void peopleDirectory.setAvatar(person.id, file);
  }

  async function lookUp() {
    looking = true;
    try {
      await peopleDirectory.lookup(person.id, true);
    } finally {
      looking = false;
    }
  }
</script>

<div class="flex min-h-10 items-center gap-3 rounded-md px-1.5 py-1">
  <Tooltip label="Change picture">
    <button
      type="button"
      aria-label="Change {person.name}'s picture"
      onclick={() => picker?.click()}
      ondragover={(e) => {
        e.preventDefault();
        over = true;
      }}
      ondragleave={() => (over = false)}
      ondrop={drop}
      class="press rounded-full ring-offset-2 ring-offset-surface {over ? 'ring-2 ring-ink' : ''}"
    >
      <Avatar {person} size={28} />
    </button>
  </Tooltip>
  <input bind:this={picker} type="file" accept="image/*" onchange={chooseFile} class="hidden" aria-hidden="true" tabindex="-1" />

  <div class="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
    <Field
      bind:value={name}
      variant="bare"
      placeholder="Name"
      ariaLabel="Name"
      autocapitalize="sentences"
      onfocus={() => (editing = "name")}
      onblur={() => (editing = null)}
      oninput={(typed) => peopleDirectory.update(person.id, { name: typed })}
      class="sm:w-5/12"
    />
    <Field
      bind:value={email}
      variant="bare"
      placeholder="Email"
      ariaLabel="Email"
      inputmode="email"
      onfocus={() => (editing = "email")}
      onblur={() => (editing = null)}
      oninput={(typed) => peopleDirectory.update(person.id, { email: typed.trim() || null })}
      class="text-fg-muted"
    />
  </div>

  <Tooltip label="Fetch name and picture from Google">
    <button
      type="button"
      aria-label="Fetch {person.name}'s name and picture from Google"
      disabled={!person.email || looking}
      onclick={() => void lookUp()}
      class="bare-button size-7 disabled:opacity-30 {looking ? 'animate-pulse' : ''}"
    >
      <CloudDownload size={14} />
    </button>
  </Tooltip>
  <Tooltip label="Remove">
    <button
      type="button"
      aria-label="Remove {person.name}"
      onclick={() => peopleDirectory.remove(person.id)}
      class="bare-button size-7 hover:text-danger"
    >
      <Trash2 size={14} />
    </button>
  </Tooltip>
</div>
