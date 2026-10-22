import { createHmac } from "node:crypto";
import { getPool } from "./db";

/** X-Hub-Signature-256 = "sha256=" + hex HMAC of the raw body. */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = header.slice("sha256=".length);
  if (got.length !== expected.length) return false;
  return Buffer.from(got, "hex").length === Buffer.from(expected, "hex").length
    && Buffer.compare(Buffer.from(gtSafe(got)), Buffer.from(expected, "hex")) === 0;
}
function gtSafe(got: string): Buffer { return Buffer.from(got, "hex"); }

type WaMessage = {
  from?: string; id?: string; timestamp?: string; type?: string;
  text?: { body?: string };
};

/**
 * Inbound processing (plan §2): raw envelope stored BEFORE anything else,
 * then per message: auto-create contact, upsert conversation
 * (last_inbound_at drives the 24h window), insert message row
 * (idempotent on wa_message_id — Meta retries on 2xx gaps).
 */
export async function processInbound(body: unknown, signatureValid: boolean): Promise<{ stored: number }> {
  const p = getPool();
  await p.query(
    `INSERT INTO webhook_events (body, signature_valid) VALUES ($1::jsonb, $2)`,
    [JSON.stringify(body), signatureValid],
  );
  if (!signatureValid) return { stored: 0 };
  if (typeof body !== "object" || body === null) return { stored: 0 };
  const entries = (body as { entry?: unknown[] }).entry;
  if (!Array.isArray(entries)) return { stored: 0 };

  const wsId = await ensureWs();
  let stored = 0;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> }).value;
      if (!value) continue;
          const statuses = value.statuses as { id?: string; status?: string }[] | undefined;
          // Meta delivery/read receipts — update the sent message rows
          if (Array.isArray(statuses)) {
            for (const st of statuses) {
              if (st.id && st.status && ["sent", "delivered", "read", "failed"].includes(st.status)) {
                await p.query(
                  `UPDATE messages SET status = $1 WHERE wa_message_id = $2 AND direction = 'out'`,
                  [st.status, st.id],
                );
              }
            }
          }
      const msgs = value.messages as WaMessage[] | undefined;
      const contacts = value.contacts as { wa_id?: string; name?: string }[] | undefined;
      if (!Array.isArray(msgs)) continue;
      for (const m of msgs) {
        if (!m.from || !m.id) continue;
        const name = contacts?.find((c) => c.wa_id === m.from)?.name ?? null;
        const contactId = await upsertContact(wsId, m.from, name);
        const convId = await upsertConversation(wsId, contactId, m.timestamp);
        const bodyText = m.type === "text" ? (m.text?.body ?? null) : `[${m.type ?? "non-text"}]`;
        const r = await p.query(
          `INSERT INTO messages
             (workspace_id, conversation_id, direction, wa_message_id, type, body, raw)
           VALUES ($1, $2, 'in', $3, $4, $5, $6::jsonb)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [wsId, convId, m.id, m.type ?? "text", bodyText, JSON.stringify(m)],
        );
        if (r.rowCount && r.rowCount > 0) stored++;
      }
    }
  }
  await p.query(
    `UPDATE webhook_events SET processed = true
      WHERE id = (SELECT id FROM webhook_events ORDER BY created_at DESC LIMIT 1)`,
  );
  return { stored };
}

async function ensureWs(): Promise<string> {
  const { rows } = await getPool().query(
    `INSERT INTO workspaces (name) VALUES ('NextBiz One')
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  return rows[0].id as string;
}

async function upsertContact(wsId: string, waId: string, name: string | null): Promise<string> {
  const { rows } = await getPool().query(
    `INSERT INTO contacts (workspace_id, wa_id, name) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, wa_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name)
     RETURNING id`,
    [wsId, waId, name],
  );
  return rows[0].id as string;
}

async function upsertConversation(wsId: string, contactId: string, ts?: string): Promise<string> {
  const at = ts && !Number.isNaN(Number(ts)) ? new Date(Number(ts) * 1000) : new Date();
  const { rows } = await getPool().query(
    `INSERT INTO conversations (workspace_id, contact_id, last_inbound_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, contact_id)
       DO UPDATE SET last_inbound_at = EXCLUDED.last_inbound_at
     RETURNING id`,
    [wsId, contactId, at],
  );
  return rows[0].id as string;
}
