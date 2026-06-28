import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// AES-256-GCM secret encryption for the credential vault. The key is derived
// from CREDENTIALS_SECRET (or AUTH_SECRET) - rotating that secret invalidates
// stored vault secrets (re-enter them), which is acceptable for v1.
function key(): Buffer {
  const secret = process.env.CREDENTIALS_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("No CREDENTIALS_SECRET/AUTH_SECRET set for vault encryption");
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB, tagB, dataB] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}
