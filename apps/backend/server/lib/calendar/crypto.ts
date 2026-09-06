import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "~/lib/env";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * A refresh token is a standing grant to someone's whole calendar, so it never sits in the
 * database in the clear — not in a Neon backup, not in drizzle studio.
 */
function loadKey(): Buffer {
  const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== KEY_BYTES) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(":");
}

export function decryptSecret(packed: string): string {
  const [iv, tag, ciphertext] = packed.split(":").map((part) => Buffer.from(part, "base64"));
  if (!iv || !tag || !ciphertext) throw new Error("Stored secret is malformed");
  const decipher = createDecipheriv(ALGORITHM, loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
