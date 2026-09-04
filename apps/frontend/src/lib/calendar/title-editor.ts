import { matchTrailing } from "./title-suggest";
import { durationLabel, parseSegments, type Segment, tokenOf, whenLabel } from "./title-tokens";

/**
 * The contenteditable side of the title line: tokens drawn as pills that can't be typed into, and
 * the DOM read back into the token text the rest of the calendar understands.
 */

/** Names for the purpose pills — the editor doesn't know what a project is called. */
export type NameOf = (kind: "project" | "practice", id: string) => string | null;

/** A caret can't land on an empty spot after a pill, so one of these gives it somewhere to be. */
const ZWSP = "​";
const ZWSP_RE = /​/g;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function pillLabel(seg: Exclude<Segment, { kind: "text" }>, nameOf: NameOf, now: Date): string {
  switch (seg.kind) {
    case "project":
    case "practice":
      return nameOf(seg.kind, seg.id) ?? "Unknown";
    case "when":
      return whenLabel(seg, now);
    case "dur":
      return durationLabel(seg.minutes);
  }
}

export function pillHtml(seg: Exclude<Segment, { kind: "text" }>, nameOf: NameOf, now: Date): string {
  const tone = seg.kind === "project" || seg.kind === "practice" ? "purpose" : seg.kind;
  return `<span class="title-pill title-pill-${tone}" contenteditable="false" data-token="${escape(tokenOf(seg))}">${escape(pillLabel(seg, nameOf, now))}</span>`;
}

/** Token text to the editor's HTML: the name as text, every token a pill, a landing after each. */
export function renderHtml(text: string, nameOf: NameOf, now: Date): string {
  return parseSegments(text)
    .map((seg) => (seg.kind === "text" ? escape(seg.value) : `${pillHtml(seg, nameOf, now)}${ZWSP}`))
    .join("");
}

/** The editor's DOM back to token text. Pills become their token; anything block-shaped a space. */
export function canonical(root: Node): string {
  let out = "";
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? "";
      else if (child instanceof HTMLElement) {
        if (child.dataset.token) out += ` ${child.dataset.token} `;
        else if (child.tagName === "BR") out += " ";
        else walk(child);
      }
    }
  };
  walk(root);
  return out.replace(ZWSP_RE, "").replace(/\s+/g, " ").trim();
}

const isBlank = (n: Node | null | undefined): n is Text =>
  !!n && n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").replace(ZWSP_RE, "") === "";

/** One Backspace takes a whole pill when the caret sits right after it. True when it did. */
export function killPillBackward(editor: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const container = range.startContainer;
  const offset = range.startOffset;
  let prev: ChildNode | null;
  if (container.nodeType === Node.TEXT_NODE && editor.contains(container)) {
    const left = (container.textContent ?? "").slice(0, offset);
    if (left.replace(ZWSP_RE, "").length > 0) return false;
    prev = container.previousSibling;
  } else if (container === editor) {
    prev = editor.childNodes[offset - 1] ?? null;
  } else return false;

  while (isBlank(prev)) prev = prev.previousSibling;
  if (!(prev instanceof HTMLElement) || !prev.dataset.token) return false;

  // Selected and deleted through the editing command so the removal is on the native undo stack.
  const del = document.createRange();
  const lead = prev.previousSibling;
  if (isBlank(lead)) del.setStartBefore(lead);
  else del.setStartBefore(prev);
  del.setEnd(container, offset);
  sel.removeAllRanges();
  sel.addRange(del);
  document.execCommand("delete");
  return true;
}

/** What is being asked for at the caret: the text node it's in, and the query's span within it. */
export interface Query {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** True for a day or time typed without an "@" — only that pill is offered, nothing else. */
  readonly bare: boolean;
}

export function readQueryAtCaret(editor: HTMLElement, now: Date): Query | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return null;
  const before = ((node as Text).textContent ?? "").slice(0, range.startOffset);
  // Up to three inner spaces, so "@next tuesday at 9am" keeps the list open; another "@" closes it.
  const m = /@([^\s@]*(?: [^\s@]*){0,3})$/.exec(before);
  if (m)
    return {
      node: node as Text,
      start: range.startOffset - m[0].length,
      end: range.startOffset,
      text: m[1],
      bare: false,
    };
  const at = matchTrailing(before, now);
  if (at === null) return null;
  return { node: node as Text, start: at, end: range.startOffset, text: before.slice(at), bare: true };
}

/** Replaces the query in the editor with a pill, leaving the caret after it. */
export function replaceQuery(editor: HTMLElement, query: Query, html: string) {
  const range = document.createRange();
  range.setStart(query.node, query.start);
  range.setEnd(query.node, query.end);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  editor.focus();
  document.execCommand("insertHTML", false, `${html}${ZWSP}&nbsp;`);
}

/** Puts the caret at the end of the name — before the pills, where typing carries on. */
export function focusName(editor: HTMLElement) {
  editor.focus();
  const first = Array.from(editor.childNodes).find((n) => n instanceof HTMLElement && n.dataset.token);
  const range = document.createRange();
  if (first?.previousSibling?.nodeType === Node.TEXT_NODE) {
    const text = first.previousSibling as Text;
    const content = text.textContent ?? "";
    range.setStart(text, content.endsWith(" ") ? content.length - 1 : content.length);
  } else if (first) range.setStartBefore(first);
  else {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
