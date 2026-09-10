/** Anything that nests: a project under a project, a task under a task. */
export interface Nested {
  readonly id: string;
  readonly parentId: string | null;
  readonly ordinal: number;
}

export interface TreeNode<T extends Nested> {
  readonly item: T;
  readonly children: readonly TreeNode<T>[];
  /** How deep it sits, the roots being zero — what an indent is drawn from. */
  readonly depth: number;
}

export interface Row<T extends Nested> {
  readonly item: T;
  readonly depth: number;
}

/**
 * The tree behind a flat list of rows, in each level's own order.
 *
 * A row whose parent isn't in the list is a root: half a tree is what a filtered list of tasks is,
 * and hiding a subtask because its parent was filtered out would lose work rather than tidy it.
 * A row that is its own ancestor — which a bad write or a cycle in Notion can make — is treated
 * the same way, because a screen that hangs is worse than one that draws a project twice.
 */
export function treeOf<T extends Nested>(items: readonly T[]): TreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  const known = new Set(items.map((item) => item.id));
  for (const item of items) {
    const parent =
      item.parentId && known.has(item.parentId) && !cycles(item.id, item.parentId, items) ? item.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), item]);
  }
  const build = (parentId: string | null, depth: number): TreeNode<T>[] =>
    [...(byParent.get(parentId) ?? [])]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((item) => ({ item, depth, children: build(item.id, depth + 1) }));
  return build(null, 0);
}

/** The tree read top to bottom, which is the order every list on screen draws. */
export function rowsOf<T extends Nested>(nodes: readonly TreeNode<T>[]): Row<T>[] {
  return nodes.flatMap((node) => [{ item: node.item, depth: node.depth }, ...rowsOf(node.children)]);
}

/** The path from the root down to one row — "ATMA / Hypocrisy / Combat", as its rows. */
export function pathTo<T extends Nested>(items: readonly T[], id: string): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Everything under a row, at any depth — what it takes with it when it is deleted. */
export function descendantsOf<T extends Nested>(items: readonly T[], id: string): T[] {
  const children = items.filter((item) => item.parentId === id && item.id !== id).sort((a, b) => a.ordinal - b.ordinal);
  return children.flatMap((child) => [child, ...descendantsOf(items, child.id)]);
}

function cycles<T extends Nested>(id: string, parentId: string, items: readonly T[]) {
  const byId = new Map(items.map((one) => [one.id, one]));
  const seen = new Set<string>([id]);
  let parent = byId.get(parentId);
  while (parent) {
    if (seen.has(parent.id)) return true;
    seen.add(parent.id);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return false;
}
