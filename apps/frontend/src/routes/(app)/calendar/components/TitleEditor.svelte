<script lang="ts">
  import {
    canonical,
    focusName,
    killPillBackward,
    type NameOf,
    pillHtml,
    type Query,
    readQueryAtCaret,
    renderHtml,
    replaceQuery,
  } from "$lib/calendar/title-editor";
  import { suggest } from "$lib/calendar/title-suggest";
  import { parseSegments } from "$lib/calendar/title-tokens";
  import { matchPurposes, type PurposeRow } from "$lib/projects/purpose-rows";
  import { tick } from "svelte";
  import TitleSuggestions, { type Item } from "./TitleSuggestions.svelte";

  /**
   * The name of the event, and the rest of it written into the same line. Blurred, it is just the
   * name. Focused, the day, the span and the purpose sit after it as pills, which are deleted like
   * letters and added by typing — "@" for a project, or a bare "1h", "13:30-14:30", "next tuesday".
   * Every change hands the whole line back as token text; the card works out what it now says.
   */
  let {
    text,
    placeholder = "Untitled",
    nameOf,
    purposes,
    oncreate,
    onchange,
    oncommit,
  }: {
    /** The line in token form — see `title-tokens.ts`. */
    text: string;
    placeholder?: string;
    nameOf: NameOf;
    purposes: readonly PurposeRow[];
    /** Makes a project by that name, or null when it can't; returns its pill token. */
    oncreate: (name: string) => string | null;
    onchange: (text: string) => void;
    oncommit: () => void;
  } = $props();

  let editor = $state<HTMLDivElement>();
  let focused = $state(false);
  let empty = $state(true);
  let items = $state<Item[]>([]);
  let active = $state(0);
  let query: Query | null = null;
  const open = $derived(items.length > 0);

  // What the card knows is only drawn while the line isn't being typed into — while it is, the DOM
  // is the truth, and a redraw would take the caret with it.
  $effect(() => {
    if (!editor || focused) return;
    editor.innerHTML = renderHtml(text, nameOf, new Date());
    empty = isEmpty(editor);
  });

  const isEmpty = (el: HTMLElement) => parseSegments(canonical(el)).every((s) => s.kind !== "text");

  export function focus() {
    if (editor) focusName(editor);
  }

  function close() {
    items = [];
    query = null;
  }

  /** Exact name, then a day or time, then the rest of the names, then the offer to make one. */
  function buildItems(q: Query): Item[] {
    const tokens = suggest(q.text, new Date()).map((suggestion) => ({ kind: "token", suggestion }) as Item);
    if (q.bare) return tokens;
    const needle = q.text.trim().toLowerCase();
    const matched = matchPurposes(purposes, q.text).sort(
      (a, b) => Number(!a.name.toLowerCase().startsWith(needle)) - Number(!b.name.toLowerCase().startsWith(needle)),
    );
    const exact = matched.find((r) => r.name.toLowerCase() === needle);
    const rest = matched.filter((r) => r !== exact).map((row) => ({ kind: "purpose", row }) as Item);
    return [
      ...(exact ? [{ kind: "purpose", row: exact } as Item] : []),
      ...tokens,
      ...rest,
      ...(needle && !exact ? [{ kind: "create", name: q.text.trim() } as Item] : []),
    ];
  }

  async function oninput() {
    if (!editor) return;
    empty = isEmpty(editor);
    onchange(canonical(editor));
    await tick();
    query = readQueryAtCaret(editor, new Date());
    if (!query) return close();
    items = buildItems(query);
    active = 0;
  }

  function pick(item: Item) {
    if (!editor || !query) return;
    const token =
      item.kind === "token"
        ? item.suggestion.token
        : item.kind === "purpose"
          ? `@${item.row.practice ? "practice" : "project"}:${item.row.purpose.practiceId ?? item.row.purpose.projectId}`
          : oncreate(item.name);
    if (!token) return close();
    const [seg] = parseSegments(token);
    if (seg.kind === "text") return close();
    replaceQuery(editor, query, pillHtml(seg, nameOf, new Date()));
    close();
    void oninput();
  }

  function onkeydown(e: KeyboardEvent) {
    if (open) {
      if (e.key === "ArrowDown") active = (active + 1) % items.length;
      else if (e.key === "ArrowUp") active = (active - 1 + items.length) % items.length;
      else if (e.key === "Enter" || e.key === "Tab") pick(items[active]);
      else if (e.key === "Escape") close();
      else return;
      e.preventDefault();
      // The card closes on Escape too, and this one was for the list.
      e.stopPropagation();
      return;
    }
    if (e.key === "Backspace" && editor && killPillBackward(editor)) {
      e.preventDefault();
      void oninput();
    } else if (e.key === "Enter") {
      // A name has no second line; Enter is done.
      e.preventDefault();
      if (!e.isComposing) editor?.blur();
    }
  }

  function onpaste(e: ClipboardEvent) {
    const pasted = e.clipboardData?.getData("text/plain");
    if (!pasted) return;
    e.preventDefault();
    document.execCommand("insertText", false, pasted.replace(/\s+/g, " "));
  }

  function onblur() {
    close();
    focused = false;
    oncommit();
  }
</script>

<div
  bind:this={editor}
  role="textbox"
  tabindex="0"
  contenteditable="true"
  spellcheck="false"
  aria-label="Event title"
  aria-multiline="false"
  data-placeholder={placeholder}
  data-empty={empty || undefined}
  class="title-editor t-heading min-w-0 flex-1"
  {oninput}
  {onkeydown}
  {onpaste}
  onfocus={() => (focused = true)}
  {onblur}
></div>

{#if open && editor}
  <TitleSuggestions {items} bind:active anchor={editor} onpick={pick} />
{/if}
