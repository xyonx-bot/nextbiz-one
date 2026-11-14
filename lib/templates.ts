/**
 * WhatsApp templates — one place for: submitting (with header media samples, footer, buttons),
 * syncing from Meta (statuses + content, and templates made in Meta's own tools), and sending
 * one approved template to one contact (inbox "restart the chat", contacts "send template").
 */
import { getPool } from "./db";
import {
  getWaCreds, pollTemplates, sendTemplate, submitTemplate, uploadTemplateSample, uploadWaMedia,
  type HeaderFormat, type SendHeader, type TplButton, type WaCreds,
} from "./wa-client";

export const TPL_COLS = `t.id, t.name, t.meta_name, t.category, t.language, t.body, t.variables, t.status, t.rejection_reason, t.updated_at, t.created_at,
  t.header, t.header_format, t.header_media_id, t.footer, t.buttons_json,
  m.name AS header_media_name, m.mime AS header_media_mime`;
export const TPL_FROM = `FROM templates t LEFT JOIN media_files m ON m.id = t.header_media_id`;

export type TplRow = {
  id: string; workspace_id?: string; name: string; meta_name: string | null; category: string; language: string; body: string; variables: string[] | null;
  status: string; header: string | null; header_format: HeaderFormat; header_media_id: string | null; footer: string | null; buttons_json: TplButton[];
};

export const MEDIA_RULES: Record<"IMAGE" | "VIDEO" | "DOCUMENT", { mimes: string[]; max: number; label: string }> = {
  IMAGE: { mimes: ["image/jpeg", "image/png"], max: 5 * 1024 * 1024, label: "JPG or PNG up to 5 MB" },
  VIDEO: { mimes: ["video/mp4", "video/3gpp"], max: 16 * 1024 * 1024, label: "MP4 up to 16 MB" },
  DOCUMENT: { mimes: ["application/pdf"], max: 16 * 1024 * 1024, label: "PDF up to 16 MB" },
};

export const varsOf = (body: string) => [...new Set(body.match(/\{\{\d+\}\}/g) ?? [])].map((t) => +t.replace(/\D/g, "")).sort((a, b) => a - b);
export const renderBody = (body: string, params: string[]) => body.replace(/\{\{(\d+)\}\}/g, (m, n) => params[+n - 1] || m);

/** Submit a stored template to Meta (uploads the header sample first when it has media). */
export async function submitRow(wsId: string, t: TplRow): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const creds = await getWaCreds(wsId);
  if (!creds) return { ok: false, error: "Connect WhatsApp first — templates are reviewed by Meta for your number." };
  let handle: string | null = null;
  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(t.header_format)) {
    if (!t.header_media_id) return { ok: false, error: `Add a sample ${t.header_format.toLowerCase()} for the header — Meta reviews it.` };
    const f = (await getPool().query(`SELECT name, mime, bytes FROM media_files WHERE id = $1 AND workspace_id = $2`, [t.header_media_id, wsId])).rows[0];
    if (!f) return { ok: false, error: "The header file is missing — upload it again." };
    const up = await uploadTemplateSample(creds, f.bytes as Buffer, f.mime, f.name);
    if (!up.ok) return { ok: false, error: `Couldn't upload the header sample: ${up.error}` };
    handle = up.handle;
  }
  const n = varsOf(t.body).length;
  const samples = Array.from({ length: n }, (_, i) => t.variables?.[i] || `Sample ${i + 1}`);
  const sub = await submitTemplate(creds, {
    name: t.meta_name ?? t.name, language: t.language, category: t.category, bodyText: t.body, samples,
    header: { format: t.header_format, text: t.header, handle }, footer: t.footer, buttons: t.buttons_json ?? [],
  });
  return sub.ok ? { ok: true, id: sub.id } : { ok: false, error: sub.error };
}

/** Pull statuses and content from Meta; adds templates created in WhatsApp Manager. Returns rows changed. */
export async function syncTemplates(wsId: string): Promise<{ ok: true; updated: number; added: number } | { ok: false; error: string }> {
  const poll = await pollTemplates(await getWaCreds(wsId));
  if (!poll.ok) return poll;
  const p = getPool();
  let updated = 0, added = 0;
  for (const m of poll.templates) {
    const status = ["approved", "pending", "rejected"].includes(m.status) ? m.status : m.status === "in_appeal" ? "pending" : null;
    const cur = (await p.query(`SELECT id, status, rejection_reason, header_format, header_media_id FROM templates WHERE workspace_id = $1 AND meta_name = $2 LIMIT 1`, [wsId, m.metaName])).rows[0];
    if (cur) {
      if (!status || cur.status === "draft") continue;
      // keep our uploaded header file; take Meta's text parts as the source of truth
      const r = await p.query(
        `UPDATE templates SET status = $2, rejection_reason = $3,
                body = COALESCE($4, body), footer = $5, buttons_json = $6::jsonb,
                header_format = CASE WHEN header_media_id IS NOT NULL AND $7 IN ('IMAGE','VIDEO','DOCUMENT') THEN header_format ELSE $7 END,
                header = $8, updated_at = CASE WHEN status <> $2 THEN now() ELSE updated_at END
          WHERE id = $1 AND (status <> $2 OR rejection_reason IS DISTINCT FROM $3 OR header_format <> $7 OR footer IS DISTINCT FROM $5 OR buttons_json <> $6::jsonb OR header IS DISTINCT FROM $8)`,
        [cur.id, status, m.rejectedReason ?? null, m.body ?? null, m.footer ?? null, JSON.stringify(m.buttons ?? []), m.headerFormat ?? "NONE", m.headerText ?? null]);
      updated += r.rowCount ?? 0;
    } else if (status && m.body && (m.category === "MARKETING" || m.category === "UTILITY")) {
      const r = await p.query(
        `INSERT INTO templates (workspace_id, name, meta_name, category, language, body, status, rejection_reason, header_format, header, footer, buttons_json)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) ON CONFLICT (workspace_id, name) DO NOTHING`,
        [wsId, m.metaName, m.category, m.language ?? "en", m.body, status, m.rejectedReason ?? null, m.headerFormat ?? "NONE", m.headerText ?? null, m.footer ?? null, JSON.stringify(m.buttons ?? [])]);
      added += r.rowCount ?? 0;
    }
  }
  return { ok: true, updated, added };
}

/** Header parameter for sending: our stored file, uploaded to WhatsApp once and reused for 25 days. */
export async function headerForSend(wsId: string, creds: WaCreds, t: Pick<TplRow, "header_format" | "header_media_id">): Promise<{ ok: true; header: SendHeader } | { ok: false; error: string }> {
  if (!["IMAGE", "VIDEO", "DOCUMENT"].includes(t.header_format)) return { ok: true, header: null };
  if (!t.header_media_id) return { ok: false, error: `This template needs a header ${t.header_format.toLowerCase()} — it was created outside NextBiz. Duplicate it here and add the file.` };
  const p = getPool();
  const f = (await p.query(`SELECT id, name, mime, bytes, wa_media_id, wa_media_at FROM media_files WHERE id = $1 AND workspace_id = $2`, [t.header_media_id, wsId])).rows[0];
  if (!f) return { ok: false, error: "The header file is missing — upload it again." };
  let id: string | null = f.wa_media_id && f.wa_media_at && Date.now() - new Date(f.wa_media_at).getTime() < 25 * 86400000 ? f.wa_media_id : null;
  if (!id) {
    const up = await uploadWaMedia(creds, f.bytes as Buffer, f.mime, f.name);
    if (!up.ok) return { ok: false, error: `Couldn't upload the header file to WhatsApp: ${up.error}` };
    id = up.id;
    await p.query(`UPDATE media_files SET wa_media_id = $2, wa_media_at = now() WHERE id = $1`, [f.id, id]);
  }
  return { ok: true, header: { format: t.header_format as "IMAGE" | "VIDEO" | "DOCUMENT", mediaId: id, filename: f.name } };
}

/** Send one approved template to one contact; opens the conversation if there isn't one yet. */
export async function sendTemplateToContact(wsId: string, contactId: string, templateId: string, params: string[]):
  Promise<{ ok: true; conversationId: string; message: { id: string; created_at: string; status: string; body: string } } | { ok: false; error: string; status: number }> {
  const p = getPool();
  const ws = (await p.query(`SELECT COALESCE(revoked, false) AS rev FROM workspaces WHERE id = $1`, [wsId])).rows[0];
  if (ws?.rev) return { ok: false, error: "Workspace messaging is paused — contact support.", status: 403 };
  const ct = (await p.query(`SELECT id, wa_id, name FROM contacts WHERE id = $1 AND workspace_id = $2`, [contactId, wsId])).rows[0];
  if (!ct) return { ok: false, error: "Contact not found.", status: 404 };
  const t = (await p.query(`SELECT * FROM templates WHERE id = $1 AND workspace_id = $2`, [templateId, wsId])).rows[0] as TplRow | undefined;
  if (!t) return { ok: false, error: "Template not found.", status: 404 };
  if (t.status !== "approved") return { ok: false, error: "Only templates Meta has approved can be sent.", status: 409 };
  const n = varsOf(t.body).length;
  const vals = Array.from({ length: n }, (_, i) => String(params[i] ?? "").trim().slice(0, 1000));
  if (vals.some((v) => !v)) return { ok: false, error: "Fill in every variable before sending.", status: 400 };
  const creds = await getWaCreds(wsId);
  if (!creds) return { ok: false, error: "WhatsApp isn't connected for this workspace.", status: 409 };
  const h = await headerForSend(wsId, creds, t);
  if (!h.ok) return { ok: false, error: h.error, status: 422 };
  const res = await sendTemplate(creds, ct.wa_id, { metaName: t.meta_name || t.name, language: t.language, params: vals, header: h.header });
  if (!res.ok) return { ok: false, error: res.error, status: 422 };

  let conv = (await p.query(`SELECT id FROM conversations WHERE contact_id = $1 AND workspace_id = $2 ORDER BY created_at LIMIT 1`, [ct.id, wsId])).rows[0];
  if (!conv) conv = (await p.query(`INSERT INTO conversations (workspace_id, contact_id) VALUES ($1, $2) ON CONFLICT (workspace_id, contact_id) DO UPDATE SET contact_id = EXCLUDED.contact_id RETURNING id`, [wsId, ct.id])).rows[0];
  const body = [t.header_format === "TEXT" && t.header ? `*${t.header}*` : null, renderBody(t.body, vals), t.footer ? `_${t.footer}_` : null].filter(Boolean).join("\n");
  const r = await p.query(
    `INSERT INTO messages (workspace_id, conversation_id, direction, wa_message_id, type, body, status, raw, template_id)
     VALUES ($1, $2, 'out', $3, 'template', $4, 'sent', $5::jsonb, $6) RETURNING id, created_at, status, body`,
    [wsId, conv.id, res.waMessageId, body, JSON.stringify({ template: t.meta_name || t.name, header: t.header_format }), t.id]);
  return { ok: true, conversationId: conv.id, message: r.rows[0] };
}
