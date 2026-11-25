/**
 * Meta "signed_request" (data deletion + deauthorize callbacks for Facebook Login and Instagram Login).
 * Format: base64url(HMAC-SHA256 signature) + "." + base64url(JSON payload), signed with the app secret.
 * Tries the Facebook app secret and the Instagram app secret — both apps point at the same callbacks.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getPool } from "./db";
import { deleteIgEvents } from "./instagram";

const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function parseSignedRequest(sr: string | null | undefined): { userId: string; app: "facebook" | "instagram" } | null {
  if (!sr || !sr.includes(".")) return null;
  const [sig, payload] = sr.split(".", 2);
  const secrets: [string | undefined, "facebook" | "instagram"][] = [[process.env.META_APP_SECRET, "facebook"], [process.env.IG_APP_SECRET, "instagram"]];
  for (const [secret, app] of secrets) {
    if (!secret) continue;
    const want = createHmac("sha256", secret).update(payload).digest(), got = b64(sig);
    if (want.length === got.length && timingSafeEqual(want, got)) {
      try {
        const data = JSON.parse(b64(payload).toString("utf8")) as { user_id?: string | number; algorithm?: string };
        if (data.algorithm && data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
        return data.user_id != null ? { userId: String(data.user_id), app } : null;
      } catch { return null; }
    }
  }
  return null;
}

/** Instagram accounts that match a Meta user id (Instagram user id or the app-scoped id). */
async function igAccountsFor(userId: string) {
  return (await getPool().query(`SELECT id, workspace_id, ig_user_id FROM ig_accounts WHERE ig_user_id = $1 OR app_scoped_id = $1`, [userId])).rows as { id: string; workspace_id: string; ig_user_id: string }[];
}

/** Deauthorize: stop using the login straight away (same as disconnecting in the app). */
export async function deauthorize(userId: string): Promise<number> {
  const accts = await igAccountsFor(userId);
  for (const a of accts) await getPool().query(`UPDATE ig_accounts SET access_token = NULL, access_token_enc = NULL, live = false, webhook_subscribed = false, updated_at = now() WHERE id = $1`, [a.id]);
  return accts.length;
}

/** Data deletion: delete what we hold for that Meta user and record a request whose status the person can check. */
export async function deleteForMetaUser(userId: string, source: "facebook" | "instagram"): Promise<string> {
  const p = getPool();
  const code = randomBytes(6).toString("hex").toUpperCase();
  const accts = await igAccountsFor(userId);
  // Instagram account rows cascade to their threads, messages and comments
  for (const a of accts) { await p.query(`DELETE FROM ig_accounts WHERE id = $1`, [a.id]); await deleteIgEvents(a.ig_user_id); }
  await p.query(
    `INSERT INTO data_deletion_requests (code, source, meta_user_id, status, detail, completed_at) VALUES ($1, $2, $3, $4, $5, now())`,
    [code, source, userId, accts.length ? "completed" : "nothing_found",
      accts.length ? `Deleted ${accts.length} connected Instagram account(s) and their messages and comments.` : "We hold no data linked to this account."]);
  return code;
}
