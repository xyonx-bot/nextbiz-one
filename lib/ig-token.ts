/** Instagram access tokens at rest: encrypted (AES-256-GCM) in ig_accounts.access_token_enc. */
import { getPool } from "./db";
import { decrypt, encrypt, encryptionReady } from "./crypto";

export type TokenCols = { access_token?: string | null; access_token_enc?: Buffer | null };

/** Token of an ig_accounts row (select both columns). Rows from before encryption fall back to the plain column. */
export const igTokenOf = (r: TokenCols | null | undefined): string | null => decrypt(r?.access_token_enc) ?? r?.access_token ?? null;

export const HAS_IG_TOKEN = "(access_token_enc IS NOT NULL OR access_token IS NOT NULL)";

/** Startup: encrypt tokens stored in plain text by earlier versions. Safe to run any number of times. */
export async function encryptStoredIgTokens(): Promise<number> {
  if (!encryptionReady()) return 0;
  const p = getPool();
  const { rows } = await p.query(`SELECT id, access_token FROM ig_accounts WHERE access_token IS NOT NULL`);
  let n = 0;
  for (const r of rows) {
    // only if it wasn't replaced in between (a reconnect or refresh)
    const u = await p.query(`UPDATE ig_accounts SET access_token_enc = $2, access_token = NULL WHERE id = $1 AND access_token = $3`, [r.id, encrypt(r.access_token), r.access_token]);
    n += u.rowCount ?? 0;
  }
  return n;
}
