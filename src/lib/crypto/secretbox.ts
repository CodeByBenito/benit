import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function loadKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENC_KEY must be 32 bytes encoded as base64.");
  }
  return key;
}

/**
 * AES-256-GCM. Output: "v1.<iv>.<tag>.<ciphertext>" (base64url parts).
 * Pure function of (plaintext, key) so it is unit-testable without env.
 */
export function seal(plaintext: string, base64Key: string): string {
  const key = loadKey(base64Key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function open(sealed: string, base64Key: string): string {
  const [version, ivPart, tagPart, dataPart] = sealed.split(".");
  if (version !== VERSION || !ivPart || !tagPart || dataPart === undefined) {
    throw new Error("Malformed sealed value.");
  }
  const key = loadKey(base64Key);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}
