/**
 * Somebody the account knows: invited to its events, sharing its projects, assigned its tasks.
 * Never an account of their own — a name, an address, a colour and, when one could be found, a
 * face. `avatar` is a small data URL uploaded here or the address of the picture Google keeps.
 */
export interface Person {
  id: string;
  name: string;
  email: string | null;
  color: string;
  avatar: string | null;
}
