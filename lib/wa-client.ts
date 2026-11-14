/**
 * WhatsApp Cloud API client — per workspace. Every call takes the workspace's credentials
 * (phone number id, WhatsApp business account id, token) from waba_connections; nothing is global.
 * The platform owner's own number keeps working through the server env token (legacy row without a stored token).
 */
import { getPool } from "./db";
import { decrypt } from "./crypto";

const API = "https://graph.facebook.com/v21.0";

export type WaCreds = { phoneNumberId: string; wabaId: string | null; token: string; displayName: string | null };
export type SendResult = { ok: true; waMessageId: string } | { ok: false; error: string; metaCode?: number };

/** Credentials for a workspace, or null when its WhatsApp isn't connected. */
export async function getWaCreds(wsId: string): Promise<WaCreds | null> {
  const { rows } = await getPool().query(
    `SELECT phone_number_id, business_account_id, access_token_enc, display_name, status
       FROM waba_connections WHERE workspace_id = $1 AND status = 'connected' ORDER BY created_at DESC LIMIT 1`, [wsId]);
  const r = rows[0];
  if (!r?.phone_number_id) return null;
  let token = decrypt(r.access_token_enc);
  // legacy: the platform owner's own number predates stored tokens — its token lives in the server env
  if (!token && process.env.PHONE_NUMBER_ID && r.phone_number_id === process.env.PHONE_NUMBER_ID) token = process.env.META_ACCESS_TOKEN ?? null;
  if (!token) return null;
  return { phoneNumberId: r.phone_number_id, wabaId: r.business_account_id ?? null, token, displayName: r.display_name ?? null };
}

/** Workspace that owns a phone number id (webhook routing). */
export async function workspaceForPhoneNumber(phoneNumberId: string | null | undefined): Promise<string | null> {
  if (!phoneNumberId) return null;
  const { rows } = await getPool().query(
    `SELECT workspace_id FROM waba_connections WHERE phone_number_id = $1 ORDER BY (status = 'connected') DESC, created_at DESC LIMIT 1`, [phoneNumberId]);
  return rows[0]?.workspace_id ?? null;
}

async function call(creds: WaCreds, path: string, body: unknown): Promise<{ res: Response; data: Record<string, unknown> | null }> {
  const res = await fetch(`${API}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  return { res, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}
function fail(res: Response, data: Record<string, unknown> | null): SendResult {
  const e = (data?.error ?? {}) as { message?: string; code?: number };
  return { ok: false, error: e.message ?? `Graph API error (${res.status})`, metaCode: e.code };
}

export async function sendText(creds: WaCreds | null, toWaId: string, body: string): Promise<SendResult> {
  if (!creds) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  const { res, data } = await call(creds, `/${creds.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", recipient_type: "individual", to: toWaId, type: "text", text: { preview_url: false, body },
  });
  const id = (data?.messages as { id?: string }[] | undefined)?.[0]?.id;
  return res.ok && id ? { ok: true, waMessageId: id } : fail(res, data);
}

/** Approved template message — the only kind WhatsApp delivers outside the 24-hour window. */
export async function sendTemplate(creds: WaCreds | null, toWaId: string, t: { metaName: string; language: string; params: string[] }): Promise<SendResult> {
  if (!creds) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  const components = t.params.length ? [{ type: "body", parameters: t.params.map((text) => ({ type: "text", text: text || "-" })) }] : [];
  const { res, data } = await call(creds, `/${creds.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", recipient_type: "individual", to: toWaId, type: "template",
    template: { name: t.metaName, language: { code: t.language }, components },
  });
  const id = (data?.messages as { id?: string }[] | undefined)?.[0]?.id;
  return res.ok && id ? { ok: true, waMessageId: id } : fail(res, data);
}

/** Template submit (one BODY component; Meta requires a flat sample per {{n}}). */
export async function submitTemplate(creds: WaCreds | null, t: {
  name: string; language: string; category: string; bodyText: string; samples?: string[];
}): Promise<{ ok: true; id: string; status: string } | { ok: false; error: string; metaCode?: number }> {
  if (!creds?.wabaId) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  const varCount = (t.bodyText.match(/{{\d+}}/g) ?? []).length;
  const samples = t.samples ?? Array.from({ length: varCount }, (_, i) => `Sample ${i + 1}`);
  const component: Record<string, unknown> = { type: "BODY", text: t.bodyText };
  // flat sample array — what Meta accepted in practice for this app (nested was rejected: "variables without sample text")
  if (varCount > 0) component.example = { body_text: samples };
  const { res, data } = await call(creds, `/${creds.wabaId}/message_templates`, { name: t.name, language: t.language, category: t.category, components: [component] });
  if (!res.ok || !data?.id) {
    const e = (data?.error ?? {}) as { message?: string; code?: number };
    return { ok: false, error: e.message ?? `Graph API error (${res.status})`, metaCode: e.code };
  }
  return { ok: true, id: String(data.id), status: String(data.status ?? "pending").toLowerCase() };
}

export async function pollTemplates(creds: WaCreds | null): Promise<
  { ok: true; templates: { metaName: string; status: string; rejectedReason?: string }[] } | { ok: false; error: string }
> {
  if (!creds?.wabaId) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  const res = await fetch(`${API}/${creds.wabaId}/message_templates?limit=200`, { headers: { Authorization: `Bearer ${creds.token}` }, signal: AbortSignal.timeout(15000) });
  const data = (await res.json().catch(() => null)) as { data?: { name: string; status: string; rejected_reason?: string }[] } | null;
  if (!res.ok || !data) return { ok: false, error: `Graph API error (${res.status})` };
  return { ok: true, templates: (data.data ?? []).map((t) => ({ metaName: t.name, status: t.status.toLowerCase(), rejectedReason: t.rejected_reason })) };
}
