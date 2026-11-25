const MAX = 40;

/** A name as the key an app will call it by: "Morning sit" is `morning-sit`. Empty when nothing usable is left. */
export function slugOf(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+|-+$/g, "")
    .slice(0, MAX)
    .replace(/-+$/, "");
  return slug.length >= 2 ? slug : "";
}

/** "10, 15, 20" as a ladder: positive numbers, each higher than the last. Null when it is not one. */
export function ladderOf(typed: string) {
  const targets = typed
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const climbs = targets.every((target, index) => target > (targets[index - 1] ?? 0));
  if (targets.length === 0 || !climbs) return null;
  return targets.map((target) => ({ target }));
}
