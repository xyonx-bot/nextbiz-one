import { getPool } from "./db";
import { verifySignature } from "./webhook";

/**
 * Instagram access prep (r-nbo-ig-access-prep) — P3 backend, MOCK-BADGED
 * until Meta app review approves instagram_business_* permissions.
 * Same contract as the WhatsApp webhook: raw envelope stored first,
 * X-Hub-Signature-256 verified against IG_APP_SECRET when configured,
 * idempotent on Meta event ids. No live Graph calls unless IG_LIVE=true.
 */

export const igLive = (): boolean => process.env.IG_LIVE === "true";

export function verifyIgSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.IG_APP_SECRET;
  if (!secret) return true; // optional in dev, FORCED when configured (same as WA)
  return verifySignature(rawBody, header, secret);
}

export type IgParsedMessage = {
  mid: string; senderId: string; senderName: string | null; body: string | null;
  timestamp: string | null; raw: unknown;
};
export type IgParsedComment = {
  commentId: string; fromId: string | null; fromName: string | null;
  mediaId: string | null; text: string | null; raw: unknown;
};
export type IgParsedEntry = {
  eventId: string; igUserId: string;
  messages: IgParsedMessage[]; comments: IgParsedComment[];
};

/** Pure parser: IG webhook body -> per-entry parsed rows + dedupe key. */
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
      const mm = m as { sender?: { id?: string; username?: string }; timestamp?: string; message?: { mid?: string; text?: string } };
      const mid = mm.message?.mid;
      if (!mid || !mm.sender?.id) continue;
      messages.push({
        mid: String(mid), senderId: String(mm.sender.id),
        senderName: mm.sender.username ?? null,
        body: mm.message?.text ?? null,
        timestamp: mm.timestamp ?? null,
        raw: m,
      });
    }
    for (const c of Array.isArray(e.changes) ? e.changes : []) {
      const ch = c as { field?: string; value?: Record<string, unknown> };
      if (ch.field !== "comments") continue;
      const v = ch.value ?? {};
      const commentId = v.comment_id ?? v.id;
      if (!commentId) continue;
      const from = (v.from ?? {}) as { id?: string; username?: string };
      comments.push({
        commentId: String(commentId), fromId: from.id ?? null, fromName: from.username ?? null,
        mediaId: v.media_id ? String(v.media_id) : null,
        text: v.text ? String(v.text) : null,
        raw: ch,
      });
    }
    // envelope dedupe key: entry id + first mid/comment id (fallback entry time)
    const firstKey = messages[0]?.mid ?? comments[0]?.commentId ?? String(e.time ?? "");
    out.push({ eventId: `${igUserId}:${firstKey}`, igUserId, messages, comments });
  }
  return out;
}

async function ensureWs(): Promise<string> {
  const { rows } = await getPool().query(
    `INSERT INTO workspaces (name) VALUES ('NextBiz One')
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  return rows[0].id as string;
}

async function ensureIgAccount(wsId: string, igUserId: string): Promise<string> {
  const { rows } = await getPool().query(
    `INSERT INTO ig_accounts (workspace_id, ig_user_id, live) VALUES ($1, $2, false)
     ON CONFLICT (workspace_id, ig_user_id) DO NOTHING RETURNING id`,
    [wsId, igUserId],
  );
  if (rows[0]) return rows[0].id as string;
  const q = await getPool().query(
    `SELECT id FROM ig_accounts WHERE workspace_id = $1 AND ig_user_id = $2`, [wsId, igUserId]);
  return q.rows[0].id as string;
}

/**
 * Inbound processing: raw envelope stored BEFORE anything else (deduped on
 * ig_event_id); when the signature is valid, DMs/comments become rows,
 * idempotent on mid/comment_id. Always called with the parsed body.
 */
export async function processIgInbound(
  body: unknown, signatureValid: boolean,
): Promise<{ stored: number; duplicate: boolean }> {
  const p = getPool();
  const entries = parseIgEvents(body);
  let stored = 0;
  let duplicate = false;
  for (const e of entries) {
    const r = await p.query(
      `INSERT INTO ig_webhook_events (ig_event_id, body, signature_valid)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (ig_event_id) DO NOTHING RETURNING id`,
      [e.eventId, JSON.stringify(body), signatureValid],
    );
    if (r.rowCount && r.rowCount > 0) {
      // fresh envelope
    } else {
      // envelope seen before: only a valid signature may (re)process it —
      // an earlier invalid-signature store must not block the valid retry
      const ex = await p.query(
        `SELECT signature_valid FROM ig_webhook_events WHERE ig_event_id = $1`, [e.eventId]);
      if (!signatureValid || ex.rows[0]?.signature_valid === true) { duplicate = true; continue; }
      await p.query(
        `UPDATE ig_webhook_events SET body = $2::jsonb, signature_valid = true, processed = false WHERE ig_event_id = $1`,
        [e.eventId, JSON.stringify(body)],
      );
    }
    if (!signatureValid) continue; // stored + flagged, not processed
    const wsId = await ensureWs();
    const acctId = await ensureIgAccount(wsId, e.igUserId);
    for (const m of e.messages) {
      const q = await p.query(
        `INSERT INTO ig_messages (workspace_id, ig_account_id, mid, sender_id, sender_name, body, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (mid) DO NOTHING RETURNING id`,
        [wsId, acctId, m.mid, m.senderId, m.senderName, m.body, JSON.stringify(m.raw)],
      );
      if (q.rowCount && q.rowCount > 0) stored++;
    }
    for (const c of e.comments) {
      const q = await p.query(
        `INSERT INTO ig_comments (ig_account_id, comment_id, from_id, from_name, media_id, text, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (comment_id) DO NOTHING RETURNING id`,
        [acctId, c.commentId, c.fromId, c.fromName, c.mediaId, c.text, JSON.stringify(c.raw)],
      );
      if (q.rowCount && q.rowCount > 0) stored++;
    }
    await p.query(`UPDATE ig_webhook_events SET processed = true WHERE ig_event_id = $1`, [e.eventId]);
  }
  return { stored, duplicate };
}

export type IgAccountRow = {
  id: string; ig_user_id: string; username: string | null; display_name: string | null;
  scopes: string[]; expires_at: string | null; live: boolean; updated_at: string;
};

/**
 * Connect flow. Mock mode (IG_LIVE != "true"): no Graph call, stores a mock
 * account row — every UI surface must badge this. Live mode: short-lived IG
 * user token -> long-lived exchange -> /me for id/username.
 */
export async function connectIgAccount(
  wsId: string, shortToken: string,
): Promise<{ account: IgAccountRow; mock: boolean }> {
  const p = getPool();
  if (!igLive()) {
    const { rows } = await p.query(
      `INSERT INTO ig_accounts (workspace_id, ig_user_id, username, display_name, scopes, live)
       VALUES ($1, 'mock-ig-user', '@mock_business', 'Mock Business', $2, false)
       ON CONFLICT (workspace_id, ig_user_id)
       DO UPDATE SET username = EXCLUDED.username, updated_at = now()
       RETURNING id, ig_user_id, username, display_name, scopes, expires_at, live, updated_at`,
      [wsId, ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"]],
    );
    await p.query(
      `INSERT INTO ig_audit (workspace_id, action, detail) VALUES ($1, 'connect-mock', $2::jsonb)`,
      [wsId, JSON.stringify({ note: "IG_LIVE=false — mock-badged, no Graph call" })],
    );
    return { account: rows[0] as IgAccountRow, mock: true };
  }
  const appId = process.env.IG_APP_ID;
  const appSecret = process.env.IG_APP_SECRET;
  if (!appId || !appSecret) throw new Error("IG_APP_ID / IG_APP_SECRET not configured on host");
  const exRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(shortToken)}`,
  );
  if (!exRes.ok) throw new Error(`token exchange failed: ${exRes.status}`);
  const ex = (await exRes.json()) as { access_token?: string; expires_in?: number };
  if (!ex.access_token) throw new Error("token exchange returned no access_token");
  const meRes = await fetch(
    `https://graph.facebook.com/v21.0/me?fields=id,username,name&access_token=${encodeURIComponent(ex.access_token)}`,
  );
  if (!meRes.ok) throw new Error(`IG /me failed: ${meRes.status}`);
  const me = (await meRes.json()) as { id?: string; username?: string; name?: string };
  if (!me.id) throw new Error("IG /me returned no id");
  const expiresAt = ex.expires_in ? new Date(Date.now() + ex.expires_in * 1000).toISOString() : null;
  const { rows } = await p.query(
    `INSERT INTO ig_accounts (workspace_id, ig_user_id, username, display_name, access_token, scopes, expires_at, live)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     ON CONFLICT (workspace_id, ig_user_id)
     DO UPDATE SET username = EXCLUDED.username, display_name = EXCLUDED.display_name,
       access_token = EXCLUDED.access_token, expires_at = EXCLUDED.expires_at,
       live = true, updated_at = now()
     RETURNING id, ig_user_id, username, display_name, scopes, expires_at, live, updated_at`,
    [wsId, me.id, me.username ?? null, me.name ?? null, ex.access_token,
      ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"],
      expiresAt],
  );
  await p.query(
    `INSERT INTO ig_audit (workspace_id, action, detail) VALUES ($1, 'connect-live', $2::jsonb)`,
    [wsId, JSON.stringify({ ig_user_id: me.id, expires_at: expiresAt })],
  );
  return { account: rows[0] as IgAccountRow, mock: false };
}

export async function getIgAccount(wsId: string): Promise<IgAccountRow | null> {
  const { rows } = await getPool().query(
    `SELECT id, ig_user_id, username, display_name, scopes, expires_at, live, updated_at
     FROM ig_accounts WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [wsId],
  );
  return (rows[0] as IgAccountRow) ?? null;
}

export async function ensureWorkspace(): Promise<string> {
  return ensureWs();
}
