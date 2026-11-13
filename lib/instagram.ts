import { getPool } from "./db";
import { verifySignature } from "./webhook";

/**
 * Instagram — "Instagram API with Instagram Login" (no Facebook Page needed).
 *   OAuth:    instagram.com/oauth/authorize → api.instagram.com/oauth/access_token (short) →
 *             graph.instagram.com/access_token (long-lived, 60 days) → refresh_access_token.
 *   Webhooks: entry.id = the IG professional account id (user_id from /me). DMs arrive as
 *             `messaging[]` (incl. echoes of messages the business sent), comments as `changes[]`.
 *   Send:     graph.instagram.com/me/messages (DM or private reply to a comment) and
 *             /{comment-id}/replies (public reply).
 * Mock mode (IG_LIVE != "true"): no Graph calls; sends are simulated and recorded, so tests and
 * beta without credentials never touch Meta.
 */

export const igLive = (): boolean => process.env.IG_LIVE === "true";
const GV = "v21.0";
const IG_GRAPH = `https://graph.instagram.com/${GV}`;

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
] as const;
export const IG_WEBHOOK_FIELDS = ["messages", "comments"] as const;

/** Fetch with a hard timeout so a slow Graph call never hangs a request into a proxy 502. */
export async function gfetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
}

/** Read Meta's error.message out of a failed Graph response (best effort). */
export async function metaErr(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string; code?: number; error_subcode?: number } };
    if (j.error?.message) return `${res.status} ${j.error.message}${j.error.code ? ` (code ${j.error.code})` : ""}`;
  } catch { /* non-JSON error body */ }
  return `${res.status}`;
}

/** Instagram app id/secret (Instagram → API setup with Instagram login). */
export function igAppCreds(env: NodeJS.ProcessEnv = process.env): { appId: string; appSecret: string } {
  return { appId: env.IG_APP_ID ?? "", appSecret: env.IG_APP_SECRET ?? "" };
}

/**
 * Webhook signature: Meta signs with the app secret. Depending on how the subscription was created
 * that is the Instagram app secret or the Meta app secret, so any configured secret may verify it.
 * Optional in dev (no secret set), enforced as soon as one is configured — same as WhatsApp.
 */
export function verifyIgSignature(rawBody: string, header: string | null): boolean {
  const secrets = [process.env.IG_APP_SECRET, process.env.META_APP_SECRET, process.env.WHATSAPP_APP_SECRET].filter(Boolean) as string[];
  if (secrets.length === 0) return true;
  return secrets.some((s) => verifySignature(rawBody, header, s));
}

/* ───────────────────────── webhook parsing ───────────────────────── */

export type IgParsedMessage = {
  mid: string; senderId: string; recipientId: string | null; senderName: string | null; body: string | null;
  isEcho: boolean; attachment: string | null; timestamp: string | null; raw: unknown;
};
export type IgParsedComment = {
  commentId: string; fromId: string | null; fromName: string | null; mediaId: string | null;
  parentId: string | null; text: string | null; raw: unknown;
};
export type IgParsedEntry = { eventId: string; igUserId: string; messages: IgParsedMessage[]; comments: IgParsedComment[] };

/** Pure parser: IG webhook body -> per-entry parsed rows + dedupe key. Never throws. */
export function parseIgEvents(body: unknown): IgParsedEntry[] {
  if (typeof body !== "object" || body === null) return [];
  const entries = (body as { entry?: unknown[] }).entry;
  if (!Array.isArray(entries)) return [];
  const out: IgParsedEntry[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { id?: string; time?: number; messaging?: unknown[]; changes?: unknown[] };
    const igUserId = String(e.id ?? "unknown");
    const messages: IgParsedMessage[] = [];
    const comments: IgParsedComment[] = [];
    for (const m of Array.isArray(e.messaging) ? e.messaging : []) {
      const mm = m as {
        sender?: { id?: string; username?: string }; recipient?: { id?: string }; timestamp?: string | number;
        message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; attachments?: { type?: string }[] };
      };
      const mid = mm.message?.mid;
      if (!mid || !mm.sender?.id || mm.message?.is_deleted) continue; // reads/reactions/deletes carry no new message
      messages.push({
        mid: String(mid), senderId: String(mm.sender.id), recipientId: mm.recipient?.id ? String(mm.recipient.id) : null,
        senderName: mm.sender.username ?? null, body: mm.message?.text ?? null, isEcho: !!mm.message?.is_echo,
        attachment: mm.message?.attachments?.[0]?.type ?? null,
        timestamp: mm.timestamp != null ? String(mm.timestamp) : null, raw: m,
      });
    }
    for (const c of Array.isArray(e.changes) ? e.changes : []) {
      const ch = c as { field?: string; value?: Record<string, unknown> };
      if (ch.field !== "comments" && ch.field !== "live_comments") continue;
      const v = ch.value ?? {};
      const commentId = v.comment_id ?? v.id;
      if (!commentId) continue;
      const from = (v.from ?? {}) as { id?: string; username?: string };
      const media = (v.media ?? {}) as { id?: string };
      comments.push({
        commentId: String(commentId), fromId: from.id ?? null, fromName: from.username ?? null,
        mediaId: media.id ? String(media.id) : v.media_id ? String(v.media_id) : null,
        parentId: v.parent_id ? String(v.parent_id) : null, text: v.text ? String(v.text) : null, raw: ch,
      });
    }
    const firstKey = messages[0]?.mid ?? comments[0]?.commentId ?? String(e.time ?? "");
    out.push({ eventId: `${igUserId}:${firstKey}`, igUserId, messages, comments });
  }
  return out;
}

/* ───────────────────────── accounts ───────────────────────── */

export type IgAccountRow = {
  id: string; workspace_id?: string; ig_user_id: string; username: string | null; display_name: string | null;
  profile_picture_url?: string | null; scopes: string[]; expires_at: string | null; live: boolean;
  webhook_subscribed?: boolean; last_error?: string | null; updated_at: string;
};
const ACCT_COLS = "id, workspace_id, ig_user_id, username, display_name, profile_picture_url, scopes, expires_at, live, webhook_subscribed, last_error, updated_at";

async function ensureWs(): Promise<string> {
  const { rows } = await getPool().query(
    `INSERT INTO workspaces (name) VALUES ('NextBiz One') ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  return rows[0].id as string;
}
export async function ensureWorkspace(): Promise<string> { return ensureWs(); }

async function ensureIgAccount(wsId: string, igUserId: string): Promise<string> {
  const p = getPool();
  const ex = await p.query(`SELECT id FROM ig_accounts WHERE ig_user_id = $1 ORDER BY live DESC, updated_at DESC LIMIT 1`, [igUserId]);
  if (ex.rows[0]) return ex.rows[0].id as string;
  const { rows } = await p.query(
    `INSERT INTO ig_accounts (workspace_id, ig_user_id, live) VALUES ($1, $2, false)
     ON CONFLICT (workspace_id, ig_user_id) DO UPDATE SET updated_at = ig_accounts.updated_at RETURNING id`,
    [wsId, igUserId],
  );
  return rows[0].id as string;
}

/** The workspace's current account (the live one when there is one). */
export async function getIgAccount(wsId: string): Promise<IgAccountRow | null> {
  const { rows } = await getPool().query(
    `SELECT ${ACCT_COLS} FROM ig_accounts WHERE workspace_id = $1 AND (live OR ig_user_id = 'mock-ig-user')
      ORDER BY live DESC, updated_at DESC LIMIT 1`, [wsId]);
  return (rows[0] as IgAccountRow) ?? null;
}
async function tokenFor(accountId: string): Promise<{ token: string | null; igUserId: string; live: boolean }> {
  const { rows } = await getPool().query(`SELECT access_token, ig_user_id, live FROM ig_accounts WHERE id = $1`, [accountId]);
  return { token: rows[0]?.access_token ?? null, igUserId: rows[0]?.ig_user_id ?? "", live: !!rows[0]?.live };
}

/** Mock connect (IG_LIVE != "true"): stores a mock-badged account, no Graph call. */
export async function connectIgAccount(wsId: string, _shortToken: string): Promise<{ account: IgAccountRow; mock: boolean }> {
  const p = getPool();
  if (igLive()) throw new Error("Use Login with Instagram to connect a live account.");
  const { rows } = await p.query(
    `INSERT INTO ig_accounts (workspace_id, ig_user_id, username, display_name, scopes, live)
     VALUES ($1, 'mock-ig-user', '@mock_business', 'Mock Business', $2, false)
     ON CONFLICT (workspace_id, ig_user_id) DO UPDATE SET username = EXCLUDED.username, updated_at = now()
     RETURNING ${ACCT_COLS}`,
    [wsId, [...IG_SCOPES]],
  );
  await p.query(`INSERT INTO ig_audit (workspace_id, action, detail) VALUES ($1, 'connect-mock', $2::jsonb)`,
    [wsId, JSON.stringify({ note: "IG_LIVE=false — mock-badged, no Graph call" })]);
  return { account: rows[0] as IgAccountRow, mock: true };
}

/* ───────────────────────── OAuth (Instagram Login) ───────────────────────── */

/** Authorize URL the Settings "Login with Instagram" button redirects to. */
export function igOAuthDialogUrl(redirectUri: string, state: string, appId: string): string {
  const q = new URLSearchParams({
    enable_fb_login: "0", force_authentication: "1", client_id: appId,
    redirect_uri: redirectUri, response_type: "code", scope: IG_SCOPES.join(","), state,
  });
  return `https://www.instagram.com/oauth/authorize?${q.toString()}`;
}

/** Subscribe the connected account to this app's webhooks (messages + comments). */
export async function subscribeIgWebhooks(token: string): Promise<{ ok: boolean; error?: string }> {
  const r = await gfetch(`${IG_GRAPH}/me/subscribed_apps?subscribed_fields=${IG_WEBHOOK_FIELDS.join(",")}&access_token=${encodeURIComponent(token)}`, { method: "POST" });
  if (!r.ok) return { ok: false, error: await metaErr(r) };
  return { ok: true };
}

/** code → short token → long-lived token → /me → store live account → subscribe webhooks. */
export async function exchangeIgCode(code: string, redirectUri: string): Promise<{ account: IgAccountRow; mock: boolean }> {
  if (!igLive()) throw new Error("IG_LIVE is not true — mock mode, no Graph call");
  const { appId, appSecret } = igAppCreds();
  if (!/^\d{6,}$/.test(appId) || appSecret.length < 16) throw new Error("Instagram app ID / secret are not configured on this server");

  const form = new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, "") });
  const tRes = await gfetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (!tRes.ok) throw new Error(`Instagram code exchange failed: ${await metaErr(tRes)}`);
  const short = (await tRes.json()) as { access_token?: string; user_id?: string | number; permissions?: string[] | string };
  if (!short.access_token) throw new Error("Instagram code exchange returned no access token");

  const lRes = await gfetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(short.access_token)}`);
  if (!lRes.ok) throw new Error(`Long-lived token exchange failed: ${await metaErr(lRes)}`);
  const long = (await lRes.json()) as { access_token?: string; expires_in?: number };
  const token = long.access_token ?? short.access_token;

  const meRes = await gfetch(`${IG_GRAPH}/me?fields=user_id,username,name,profile_picture_url&access_token=${encodeURIComponent(token)}`);
  if (!meRes.ok) throw new Error(`Couldn't read the Instagram profile: ${await metaErr(meRes)}`);
  const me = (await meRes.json()) as { user_id?: string; id?: string; username?: string; name?: string; profile_picture_url?: string };
  const igUserId = String(me.user_id ?? me.id ?? "");
  if (!igUserId) throw new Error("Instagram profile returned no account id");

  const granted = Array.isArray(short.permissions) ? short.permissions : String(short.permissions ?? IG_SCOPES.join(",")).split(",");
  const p = getPool();
  const wsId = await ensureWs();
  const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null;
  // one live Instagram account per workspace: retire any other live row
  await p.query(`UPDATE ig_accounts SET live = false, access_token = NULL, updated_at = now() WHERE workspace_id = $1 AND ig_user_id <> $2 AND live`, [wsId, igUserId]);
  const { rows } = await p.query(
    `INSERT INTO ig_accounts (workspace_id, ig_user_id, app_scoped_id, username, display_name, profile_picture_url, access_token, scopes, expires_at, live, token_refreshed_at, last_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, now(), NULL)
     ON CONFLICT (workspace_id, ig_user_id) DO UPDATE SET app_scoped_id = EXCLUDED.app_scoped_id, username = EXCLUDED.username,
       display_name = EXCLUDED.display_name, profile_picture_url = EXCLUDED.profile_picture_url, access_token = EXCLUDED.access_token,
       scopes = EXCLUDED.scopes, expires_at = EXCLUDED.expires_at, live = true, token_refreshed_at = now(), last_error = NULL, updated_at = now()
     RETURNING ${ACCT_COLS}`,
    [wsId, igUserId, short.user_id != null ? String(short.user_id) : null, me.username ?? null, me.name ?? null, me.profile_picture_url ?? null, token, granted, expiresAt],
  );
  const sub = await subscribeIgWebhooks(token);
  await p.query(`UPDATE ig_accounts SET webhook_subscribed = $2, last_error = $3 WHERE id = $1`, [rows[0].id, sub.ok, sub.ok ? null : `Webhook subscription failed: ${sub.error}`]);
  await p.query(`INSERT INTO ig_audit (workspace_id, action, detail) VALUES ($1, 'oauth-connect', $2::jsonb)`,
    [wsId, JSON.stringify({ ig_user_id: igUserId, username: me.username ?? null, scopes: granted, webhooks: sub.ok ? "subscribed" : sub.error, expires_at: expiresAt })]);
  return { account: { ...(rows[0] as IgAccountRow), webhook_subscribed: sub.ok }, mock: false };
}

/** Refresh long-lived tokens that expire within `withinDays` (Meta allows refresh once a token is 24h old). */
export async function refreshIgTokens(withinDays = 15): Promise<{ refreshed: number; failed: number }> {
  if (!igLive()) return { refreshed: 0, failed: 0 };
  const p = getPool();
  const { rows } = await p.query(
    `SELECT id, access_token FROM ig_accounts WHERE live AND access_token IS NOT NULL
       AND (expires_at IS NULL OR expires_at < now() + ($1 || ' days')::interval)
       AND (token_refreshed_at IS NULL OR token_refreshed_at < now() - interval '1 day')`, [String(withinDays)]);
  let refreshed = 0, failed = 0;
  for (const r of rows) {
    const res = await gfetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(r.access_token)}`).catch(() => null);
    if (res?.ok) {
      const j = (await res.json()) as { access_token?: string; expires_in?: number };
      await p.query(`UPDATE ig_accounts SET access_token = COALESCE($2, access_token), expires_at = $3, token_refreshed_at = now(), last_error = NULL WHERE id = $1`,
        [r.id, j.access_token ?? null, j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null]);
      refreshed++;
    } else {
      await p.query(`UPDATE ig_accounts SET last_error = $2 WHERE id = $1`, [r.id, `Token refresh failed: ${res ? await metaErr(res) : "network"}`]);
      failed++;
    }
  }
  return { refreshed, failed };
}

/* ───────────────────────── sending ───────────────────────── */

export type IgSendResult = { ok: true; mid: string } | { ok: false; error: string; code?: number };

async function graphPost(path: string, token: string, body: unknown): Promise<Response> {
  return gfetch(`${IG_GRAPH}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
}
async function sendErr(r: Response): Promise<IgSendResult> {
  let code: number | undefined;
  try { code = ((await r.clone().json()) as { error?: { code?: number } }).error?.code; } catch { /* ignore */ }
  return { ok: false, error: await metaErr(r), code };
}

/** DM to a customer (inside Instagram's 24-hour window). */
export async function igSendDm(accountId: string, igsid: string, text: string): Promise<IgSendResult> {
  const a = await tokenFor(accountId);
  if (!igLive() || !a.live) return { ok: true, mid: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  if (!a.token) return { ok: false, error: "Instagram isn't connected — reconnect in Settings." };
  const r = await graphPost("/me/messages", a.token, { recipient: { id: igsid }, message: { text } });
  if (!r.ok) return sendErr(r);
  const j = (await r.json()) as { message_id?: string };
  return { ok: true, mid: j.message_id ?? `sent-${Date.now()}` };
}

/** Private reply: a DM to the person who commented (one per comment, within 7 days). */
export async function igPrivateReply(accountId: string, commentId: string, text: string): Promise<IgSendResult> {
  const a = await tokenFor(accountId);
  if (!igLive() || !a.live) return { ok: true, mid: `mock-pr-${Date.now()}` };
  if (!a.token) return { ok: false, error: "Instagram isn't connected — reconnect in Settings." };
  const r = await graphPost("/me/messages", a.token, { recipient: { comment_id: commentId }, message: { text } });
  if (!r.ok) return sendErr(r);
  const j = (await r.json()) as { message_id?: string };
  return { ok: true, mid: j.message_id ?? `pr-${Date.now()}` };
}

/** Public reply under a comment. */
export async function igPublicReply(accountId: string, commentId: string, text: string): Promise<IgSendResult> {
  const a = await tokenFor(accountId);
  if (!igLive() || !a.live) return { ok: true, mid: `mock-cr-${Date.now()}` };
  if (!a.token) return { ok: false, error: "Instagram isn't connected — reconnect in Settings." };
  const r = await gfetch(`${IG_GRAPH}/${encodeURIComponent(commentId)}/replies?message=${encodeURIComponent(text)}`, { method: "POST", headers: { Authorization: `Bearer ${a.token}` } });
  if (!r.ok) return sendErr(r);
  const j = (await r.json()) as { id?: string };
  return { ok: true, mid: j.id ?? `cr-${Date.now()}` };
}

/** Best-effort customer profile (User Profile API) — only for people who messaged the account. */
async function fetchProfile(accountId: string, igsid: string): Promise<{ username?: string; name?: string }> {
  const a = await tokenFor(accountId);
  if (!igLive() || !a.live || !a.token) return {};
  const r = await gfetch(`${IG_GRAPH}/${encodeURIComponent(igsid)}?fields=name,username&access_token=${encodeURIComponent(a.token)}`).catch(() => null);
  if (!r?.ok) return {};
  return (await r.json()) as { username?: string; name?: string };
}

/* ───────────────────────── threads + inbound ───────────────────────── */

export async function ensureThread(wsId: string, accountId: string, igsid: string, username: string | null): Promise<{ id: string; created: boolean }> {
  const p = getPool();
  const ex = await p.query(`SELECT id, username FROM ig_threads WHERE ig_account_id = $1 AND igsid = $2`, [accountId, igsid]);
  if (ex.rows[0]) {
    if (username && !ex.rows[0].username) await p.query(`UPDATE ig_threads SET username = $2 WHERE id = $1`, [ex.rows[0].id, username]);
    return { id: ex.rows[0].id as string, created: false };
  }
  const prof = username ? { username } : await fetchProfile(accountId, igsid);
  const { rows } = await p.query(
    `INSERT INTO ig_threads (workspace_id, ig_account_id, igsid, username, name) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ig_account_id, igsid) DO UPDATE SET username = COALESCE(ig_threads.username, EXCLUDED.username) RETURNING id`,
    [wsId, accountId, igsid, prof.username ?? null, prof.name ?? null],
  );
  return { id: rows[0].id as string, created: true };
}

/** Record an outbound message the app sent (so the echo webhook dedupes on mid). */
export async function recordOutbound(wsId: string, accountId: string, threadId: string, mid: string, body: string, origin: "app" | "automation", status: "sent" | "failed", error?: string) {
  await getPool().query(
    `INSERT INTO ig_messages (workspace_id, ig_account_id, thread_id, mid, sender_id, body, raw, direction, status, origin, error)
     VALUES ($1, $2, $3, $4, 'self', $5, '{}'::jsonb, 'out', $6, $7, $8) ON CONFLICT (mid) DO NOTHING`,
    [wsId, accountId, threadId, mid, body, status, origin, error ?? null],
  );
}

/**
 * Inbound processing: raw envelope stored first (deduped on entry+first id); with a valid signature
 * DMs become thread messages (echoes = business replies, which pause automation when sent from the
 * Instagram app), comments become rows; then automation runs. Idempotent on Meta ids.
 */
export async function processIgInbound(body: unknown, signatureValid: boolean): Promise<{ stored: number; duplicate: boolean }> {
  const p = getPool();
  let stored = 0, duplicate = false;
  for (const e of parseIgEvents(body)) {
    const r = await p.query(
      `INSERT INTO ig_webhook_events (ig_event_id, body, signature_valid) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (ig_event_id) DO NOTHING RETURNING id`, [e.eventId, JSON.stringify(body), signatureValid]);
    if (!(r.rowCount && r.rowCount > 0)) {
      const ex = await p.query(`SELECT signature_valid FROM ig_webhook_events WHERE ig_event_id = $1`, [e.eventId]);
      if (!signatureValid || ex.rows[0]?.signature_valid === true) { duplicate = true; continue; }
      await p.query(`UPDATE ig_webhook_events SET body = $2::jsonb, signature_valid = true, processed = false WHERE ig_event_id = $1`, [e.eventId, JSON.stringify(body)]);
    }
    if (!signatureValid) continue;
    const wsId = await ensureWs();
    const acctId = await ensureIgAccount(wsId, e.igUserId);
    const fresh: { threadId: string; text: string; created: boolean }[] = [];

    for (const m of e.messages) {
      const customer = m.isEcho ? m.recipientId : m.senderId;
      if (!customer) continue;
      const th = await ensureThread(wsId, acctId, customer, m.isEcho ? null : m.senderName);
      const text = m.body ?? (m.attachment ? `[${m.attachment}]` : null);
      const q = await p.query(
        `INSERT INTO ig_messages (workspace_id, ig_account_id, thread_id, mid, sender_id, sender_name, body, raw, direction, status, origin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11) ON CONFLICT (mid) DO NOTHING RETURNING id`,
        [wsId, acctId, th.id, m.mid, m.senderId, m.senderName, text, JSON.stringify(m.raw), m.isEcho ? "out" : "in", m.isEcho ? "sent" : "received", m.isEcho ? "ig_app" : "customer"]);
      if (!(q.rowCount && q.rowCount > 0)) continue; // already known (incl. echoes of our own API sends)
      stored++;
      if (m.isEcho) {
        // a person replied from the Instagram app → automation steps aside for this chat
        await p.query(`UPDATE ig_threads SET automation_paused = true, automation_paused_at = now() WHERE id = $1`, [th.id]);
      } else {
        await p.query(`UPDATE ig_threads SET last_inbound_at = now() WHERE id = $1`, [th.id]);
        fresh.push({ threadId: th.id, text: text ?? "", created: th.created });
      }
    }

    const acctUser = (await p.query(`SELECT ig_user_id FROM ig_accounts WHERE id = $1`, [acctId])).rows[0]?.ig_user_id;
    const freshComments: { commentId: string; text: string; fromId: string | null }[] = [];
    for (const c of e.comments) {
      const q = await p.query(
        `INSERT INTO ig_comments (ig_account_id, comment_id, from_id, from_name, media_id, text, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT (comment_id) DO NOTHING RETURNING id`,
        [acctId, c.commentId, c.fromId, c.fromName, c.mediaId, c.text, JSON.stringify(c.raw)]);
      if (!(q.rowCount && q.rowCount > 0)) continue;
      stored++;
      if (c.fromId && c.fromId !== acctUser) freshComments.push({ commentId: c.commentId, text: c.text ?? "", fromId: c.fromId }); // skip our own replies
    }
    await p.query(`UPDATE ig_webhook_events SET processed = true WHERE ig_event_id = $1`, [e.eventId]);

    const { igAutoReplyDm, igAutoReplyComment } = await import("./ig-automation");
    for (const f of fresh) await igAutoReplyDm(wsId, acctId, f.threadId, f.text);
    for (const c of freshComments) await igAutoReplyComment(wsId, acctId, c.commentId, c.text);
  }
  return { stored, duplicate };
}
