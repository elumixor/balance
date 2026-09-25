/** Avatar colours, picked by a key of the person's own so the same face is the same colour everywhere. */
const COLORS = ["#e8b931", "#4f9dde", "#7bc86c", "#d97ec4", "#e0725b", "#8f7bd8"];

export function colorFor(key: string): string {
  const sum = [...key].reduce((total, char) => total + char.charCodeAt(0), 0);
  return COLORS[sum % COLORS.length] as string;
}
