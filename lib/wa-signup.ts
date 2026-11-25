/**
 * WhatsApp Embedded Signup (Facebook Login for Business, "WhatsApp Embedded Signup" configuration).
 *
 * Browser: FB.login({ config_id, response_type: "code", override_default_response_type: true, extras: { sessionInfoVersion: "3" } })
 *   → returns an auth `code`; the popup also posts a WA_EMBEDDED_SIGNUP message with waba_id + phone_number_id.
 * Server (here): code → business integration token → read the number → subscribe our app to the WABA's
 *   webhooks → register the number for Cloud API → store the token encrypted on this workspace.
 *
 * Needs on the server: META_APP_ID, META_APP_SECRET, WA_ES_CONFIG_ID (from Meta → Facebook Login for Business →
 * Configurations) and APP_ENCRYPTION_KEY. Without them the UI shows the guided "we'll connect it with you" state.
 */
import { randomInt } from "node:crypto";
import { getPool } from "./db";
import { decrypt, encrypt, encryptionReady } from "./crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

export type WaSignupConfig = { ready: boolean; appId: string | null; configId: string | null; missing: string[] };

export function waSignupConfig(): WaSignupConfig {
  const appId = process.env.META_APP_ID ?? "", configId = process.env.WA_ES_CONFIG_ID ?? "", secret = process.env.META_APP_SECRET ?? "";
  const missing: string[] = [];
  if (!/^\d{6,}$/.test(appId)) missing.push("META_APP_ID");
  if (!/^\d{6,}$/.test(configId)) missing.push("WA_ES_CONFIG_ID");
  if (secret.length < 16) missing.push("META_APP_SECRET");
  if (!encryptionReady()) missing.push("APP_ENCRYPTION_KEY");
  return { ready: missing.length === 0, appId: appId || null, configId: configId || null, missing };
}

async function gjson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}
const errOf = (d: Record<string, unknown>, fallback: string) => {
  const e = (d.error ?? {}) as { message?: string; error_user_msg?: string };
  return e.error_user_msg ?? e.message ?? fallback;
};

/** WABA ids the token was granted on (fallback when the browser didn't pass waba_id). */
async function grantedWabaIds(token: string, appId: string, secret: string): Promise<string[]> {
  const r = await gjson(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${secret}`)}`);
  const scopes = ((r.data.data as { granular_scopes?: { scope: string; target_ids?: string[] }[] } | undefined)?.granular_scopes) ?? [];
  return scopes.find((s) => s.scope === "whatsapp_business_management")?.target_ids ?? [];
}

export type SignupResult =
  | { ok: true; displayName: string; phoneNumberId: string; wabaId: string; registered: boolean; note?: string }
  | { ok: false; error: string; status: number };

export async function completeEmbeddedSignup(
  wsId: string,
  input: { code: string; wabaId?: string | null; phoneNumberId?: string | null },
): Promise<SignupResult> {
  const cfg = waSignupConfig();
  if (!cfg.ready) return { ok: false, status: 409, error: "WhatsApp self-connect isn't switched on for this server yet." };
  const appId = cfg.appId!, secret = process.env.META_APP_SECRET!;

  // 1 · code → business integration system-user token (long-lived)
  const t = await gjson(`${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(input.code)}`);
  const token = t.data.access_token as string | undefined;
  if (!t.ok || !token) return { ok: false, status: 422, error: `Meta didn't accept the sign-in: ${errOf(t.data, "code exchange failed")}` };

  // 2 · which WhatsApp account + number
  let wabaId = input.wabaId ?? null;
  if (!wabaId) wabaId = (await grantedWabaIds(token, appId, secret))[0] ?? null;
  if (!wabaId) return { ok: false, status: 400, error: "No WhatsApp Business account was shared — run the connect again and pick one." };
  let pnid = input.phoneNumberId ?? null;
  if (!pnid) {
    const ph = await gjson(`${GRAPH}/${wabaId}/phone_numbers?fields=id&access_token=${encodeURIComponent(token)}`);
    pnid = ((ph.data.data as { id: string }[] | undefined) ?? [])[0]?.id ?? null;
  }
  if (!pnid) return { ok: false, status: 400, error: "That WhatsApp account has no phone number yet — add one in the connect window." };
  const info = await gjson(`${GRAPH}/${pnid}?fields=display_phone_number,verified_name&access_token=${encodeURIComponent(token)}`);
  if (!info.ok) return { ok: false, status: 422, error: `Couldn't read the number: ${errOf(info.data, "phone lookup failed")}` };
  const display = `${String(info.data.verified_name ?? "WhatsApp Business")} (${String(info.data.display_phone_number ?? "").trim()})`;

  // one number feeds one workspace — webhooks are routed by it
  const p = getPool();
  const taken = await p.query(`SELECT 1 FROM waba_connections WHERE phone_number_id = $1 AND workspace_id <> $2 AND status = 'connected'`, [pnid, wsId]);
  if (taken.rows.length) return { ok: false, status: 409, error: "This number is already connected to another NextBiz One workspace." };

  // 3 · our app receives this WABA's webhooks
  const sub = await gjson(`${GRAPH}/${wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!sub.ok) return { ok: false, status: 422, error: `Couldn't subscribe to the number's messages: ${errOf(sub.data, "subscribe failed")}` };

  // 4 · register the number on Cloud API (a number that is already registered answers with an error we can ignore)
  const reg = await gjson(`${GRAPH}/${pnid}/register`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin: String(randomInt(100000, 999999)) }),
  });
  const note = reg.ok ? undefined : `Registration: ${errOf(reg.data, "not registered")}`;

  // 5 · store (token encrypted), retire any older number on this workspace
  await p.query(`UPDATE waba_connections SET status = 'disconnected' WHERE workspace_id = $1 AND phone_number_id <> $2`, [wsId, pnid]);
  await p.query(
    `INSERT INTO waba_connections (workspace_id, phone_number_id, business_account_id, access_token_enc, display_name, status)
     VALUES ($1, $2, $3, $4, $5, 'connected')
     ON CONFLICT (workspace_id, phone_number_id) DO UPDATE SET business_account_id = EXCLUDED.business_account_id,
       access_token_enc = EXCLUDED.access_token_enc, display_name = EXCLUDED.display_name, status = 'connected'`,
    [wsId, pnid, wabaId, encrypt(token), display],
  );
  return { ok: true, displayName: display, phoneNumberId: pnid, wabaId, registered: reg.ok, note };
}

/** The platform owner's own number: its token lives in the server env, so it can be switched back on without a Facebook login. */
async function ownNumberRow(wsId: string) {
  if (!process.env.PHONE_NUMBER_ID) return null;
  return (await getPool().query(`SELECT id, status FROM waba_connections WHERE workspace_id = $1 AND phone_number_id = $2`, [wsId, process.env.PHONE_NUMBER_ID])).rows[0] as { id: string; status: string } | undefined ?? null;
}
export async function canReconnectOwnNumber(wsId: string): Promise<boolean> {
  return (await ownNumberRow(wsId))?.status === "disconnected";
}
export async function reconnectOwnNumber(wsId: string): Promise<boolean> {
  const row = await ownNumberRow(wsId);
  if (!row || row.status !== "disconnected") return false;
  const p = getPool();
  await p.query(`UPDATE waba_connections SET status = 'disconnected', access_token_enc = NULL WHERE workspace_id = $1 AND id <> $2`, [wsId, row.id]);
  await p.query(`UPDATE waba_connections SET status = 'connected' WHERE id = $1`, [row.id]);
  return true;
}

/** Disconnect: stop Meta sending us the number's events, stop using it in this workspace and forget its token. */
export async function disconnectWhatsApp(wsId: string): Promise<void> {
  const p = getPool();
  const { rows } = await p.query(`SELECT business_account_id, access_token_enc FROM waba_connections WHERE workspace_id = $1 AND status = 'connected'`, [wsId]);
  await p.query(`UPDATE waba_connections SET status = 'disconnected', access_token_enc = NULL WHERE workspace_id = $1`, [wsId]);
  for (const r of rows) {
    const token = decrypt(r.access_token_enc); // no stored token = the platform's own number, whose subscription stays
    if (!token || !r.business_account_id) continue;
    // the subscription covers the whole WhatsApp account — keep it while another workspace uses a number on it
    if ((await p.query(`SELECT 1 FROM waba_connections WHERE business_account_id = $1 AND status = 'connected'`, [r.business_account_id])).rows.length) continue;
    await gjson(`${GRAPH}/${r.business_account_id}/subscribed_apps`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  }
}
