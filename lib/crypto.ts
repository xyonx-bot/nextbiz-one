import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for third-party tokens at rest (WhatsApp business tokens).
 * Key: APP_ENCRYPTION_KEY (any string; SHA-256 → 32 bytes). Layout: iv(12) | tag(16) | ciphertext.
 */
function key(): Buffer {
  const k = process.env.APP_ENCRYPTION_KEY;
  if (!k || k.length < 16) throw new Error("APP_ENCRYPTION_KEY is not configured");
  return createHash("sha256").update(k).digest();
}
export const encryptionReady = (): boolean => (process.env.APP_ENCRYPTION_KEY ?? "").length >= 16;

export function encrypt(plain: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function decrypt(blob: Buffer | null | undefined): string | null {
  if (!blob || blob.length < 29) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString("utf8");
  } catch { return null; }
}
