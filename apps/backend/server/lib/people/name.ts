/**
 * A name read off an address, for somebody the calendar only knows by their mail. "john.doe" is
 * "John Doe", "jdoe42" is "Jdoe42" — a guess, and one a person can correct, but a row that says
 * "Someone" is a row nobody can find later.
 */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1));
  return words.join(" ") || email;
}
