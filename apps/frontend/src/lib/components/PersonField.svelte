<script lang="ts">
  import { peopleDirectory } from "$lib/people/directory.svelte";
  import { isEmail, suggestPeople } from "$lib/people/suggest";
  import type { Person } from "$lib/people/types";
  import Avatar from "./Avatar.svelte";
  import ComboField, { type ComboOption } from "./ComboField.svelte";

  /**
   * The one field a person is named in — a guest, a member, an assignee. What is typed is matched
   * against everyone the account knows, by name or by address, and each row wears their face; a
   * name or an address nobody matches is still an answer, and becomes a row of its own so it is
   * offered next time. Blur and Escape both hand back to the parent, which decides what the field
   * was standing in for.
   */
  let {
    taken = [],
    placeholder = "Name or email",
    ariaLabel = placeholder,
    /** Whether typed text has to be an address to count — a guest needs one; a member doesn't. */
    emailOnly = false,
    autofocus = false,
    variant = "bare",
    onpick,
    ondone,
  }: {
    taken?: readonly string[];
    placeholder?: string;
    ariaLabel?: string;
    emailOnly?: boolean;
    autofocus?: boolean;
    variant?: "boxed" | "bare";
    onpick: (person: Person) => void;
    /** The field was left — by blur or Escape — with whatever was typed still unpicked. */
    ondone?: () => void;
  } = $props();

  let text = $state("");

  const suggestions = $derived(
    suggestPeople(emailOnly ? peopleDirectory.all.filter((p) => p.email) : peopleDirectory.all, text, taken).map(
      (person): ComboOption<Person> => ({
        key: person.id,
        label: person.name,
        hint: person.email && person.email !== person.name ? person.email : undefined,
        value: person,
      }),
    ),
  );

  function pick(person: Person) {
    text = "";
    onpick(person);
  }

  function free(typed: string) {
    const trimmed = typed.trim();
    text = "";
    if (!trimmed || (emailOnly && !isEmail(trimmed))) return;
    pick(peopleDirectory.ensure(trimmed));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="min-w-0 flex-1"
  onfocusout={(e) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (text.trim()) free(text);
    ondone?.();
  }}
  onkeydown={(e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    text = "";
    ondone?.();
  }}
>
  <ComboField
    bind:value={text}
    options={suggestions}
    {autofocus}
    {variant}
    width="anchor"
    {placeholder}
    {ariaLabel}
    autocapitalize="sentences"
    onpick={(option) => pick(option.value)}
    onfree={free}
  >
    {#snippet row(option)}
      <Avatar person={option.value} size={18} />
      <span class="min-w-0 flex-1 truncate">{option.label}</span>
      {#if option.hint}<span class="t-micro shrink-0 truncate text-fg-muted">{option.hint}</span>{/if}
    {/snippet}
  </ComboField>
</div>
