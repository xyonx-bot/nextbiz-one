/**
 * WhatsApp Cloud API client — per workspace. Every call takes the workspace's credentials
 * (phone number id, WhatsApp business account id, token) from waba_connections; nothing is global.
 * The platform owner's own number keeps working through the server env token (legacy row without a stored token).
 */
import { getPool } from "./db";
import { decrypt } from "./crypto";
import { demoMsgId, demoTicks, isDemoId } from "./demo";

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
  if (isDemoId(r.phone_number_id)) return { phoneNumberId: r.phone_number_id, wabaId: r.business_account_id ?? null, token: "demo", displayName: r.display_name ?? null };
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
  if (isDemoId(creds.phoneNumberId)) { const id = demoMsgId(); demoTicks(id); return { ok: true, waMessageId: id }; }
  const { res, data } = await call(creds, `/${creds.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", recipient_type: "individual", to: toWaId, type: "text", text: { preview_url: false, body },
  });
  const id = (data?.messages as { id?: string }[] | undefined)?.[0]?.id;
  return res.ok && id ? { ok: true, waMessageId: id } : fail(res, data);
}

export type TplButton = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone?: string };
export type HeaderFormat = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type SendHeader = { format: "IMAGE" | "VIDEO" | "DOCUMENT"; mediaId: string; filename?: string } | null;

/** Approved template message — the only kind WhatsApp delivers outside the 24-hour window. */
export async function sendTemplate(creds: WaCreds | null, toWaId: string, t: { metaName: string; language: string; params: string[]; header?: SendHeader }): Promise<SendResult> {
  if (!creds) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  if (isDemoId(creds.phoneNumberId)) { const id = demoMsgId(); demoTicks(id); return { ok: true, waMessageId: id }; }
  const components: Record<string, unknown>[] = [];
  if (t.header) {
    const kind = t.header.format.toLowerCase();
    const media: Record<string, unknown> = { id: t.header.mediaId };
    if (kind === "document" && t.header.filename) media.filename = t.header.filename;
    components.push({ type: "header", parameters: [{ type: kind, [kind]: media }] });
  }
  if (t.params.length) components.push({ type: "body", parameters: t.params.map((text) => ({ type: "text", text: text || "-" })) });
  const { res, data } = await call(creds, `/${creds.phoneNumberId}/messages`, {
    messaging_product: "whatsapp", recipient_type: "individual", to: toWaId, type: "template",
    template: { name: t.metaName, language: { code: t.language }, components },
  });
  const id = (data?.messages as { id?: string }[] | undefined)?.[0]?.id;
  return res.ok && id ? { ok: true, waMessageId: id } : fail(res, data);
}

/** Upload a file to WhatsApp's media store (for sending). Returns a media id valid for ~30 days. */
export async function uploadWaMedia(creds: WaCreds | null, bytes: Buffer, mime: string, name: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!creds) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  if (isDemoId(creds.phoneNumberId)) return { ok: true, id: demoMsgId("media") };
  const fd = new FormData();
  fd.set("messaging_product", "whatsapp"); fd.set("type", mime);
  fd.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
  const res = await fetch(`${API}/${creds.phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${creds.token}` }, body: fd, signal: AbortSignal.timeout(60000) });
  const d = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  return res.ok && d?.id ? { ok: true, id: d.id } : { ok: false, error: d?.error?.message ?? `Upload failed (${res.status})` };
}

/**
 * Sample file for a media header, via Meta's Resumable Upload API. Meta reviews the template with it;
 * the handle is only used at creation time. The app id comes from the token itself (GET /app).
 */
export async function uploadTemplateSample(creds: WaCreds | null, bytes: Buffer, mime: string, name: string): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
  if (!creds) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  if (isDemoId(creds.phoneNumberId)) return { ok: true, handle: demoMsgId("h") };
  const auth = { Authorization: `OAuth ${creds.token}` };
  const app = (await fetch(`${API}/app?access_token=${encodeURIComponent(creds.token)}`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null)) as { id?: string } | null;
  const appId = app?.id ?? process.env.META_APP_ID;
  if (!appId) return { ok: false, error: "Couldn't find the Meta app for this WhatsApp login" };
  const qs = new URLSearchParams({ file_name: name, file_length: String(bytes.length), file_type: mime, access_token: creds.token });
  const s = (await fetch(`${API}/${appId}/uploads?${qs}`, { method: "POST", signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (!s?.id) return { ok: false, error: s?.error?.message ?? "Meta didn't start the upload" };
  const u = (await fetch(`${API}/${s.id}`, { method: "POST", headers: { ...auth, file_offset: "0" }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(120000) }).then((r) => r.json()).catch(() => null)) as { h?: string; error?: { message?: string } } | null;
  return u?.h ? { ok: true, handle: u.h } : { ok: false, error: u?.error?.message ?? "Meta didn't accept the file" };
}

export type TemplateDef = {
  name: string; language: string; category: string; bodyText: string; samples?: string[];
  header?: { format: HeaderFormat; text?: string | null; handle?: string | null };
  footer?: string | null; buttons?: TplButton[];
};
export function templateComponents(t: TemplateDef): Record<string, unknown>[] {
  const varCount = (t.bodyText.match(/{{\d+}}/g) ?? []).length;
  const samples = t.samples ?? Array.from({ length: varCount }, (_, i) => `Sample ${i + 1}`);
  const out: Record<string, unknown>[] = [];
  const h = t.header;
  if (h && h.format === "TEXT" && h.text) out.push({ type: "HEADER", format: "TEXT", text: h.text });
  if (h && (h.format === "IMAGE" || h.format === "VIDEO" || h.format === "DOCUMENT") && h.handle) out.push({ type: "HEADER", format: h.format, example: { header_handle: [h.handle] } });
  const body: Record<string, unknown> = { type: "BODY", text: t.bodyText };
  // flat sample array — what Meta accepted in practice for this app (nested was rejected: "variables without sample text")
  if (varCount > 0) body.example = { body_text: samples };
  out.push(body);
  if (t.footer) out.push({ type: "FOOTER", text: t.footer });
  if (t.buttons?.length) out.push({ type: "BUTTONS", buttons: t.buttons.map((b) => b.type === "URL" ? { type: "URL", text: b.text, url: b.url } : b.type === "PHONE_NUMBER" ? { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone } : { type: "QUICK_REPLY", text: b.text }) });
  return out;
}

/** Template submit — header (text or media sample), body with samples, footer, buttons. */
export async function submitTemplate(creds: WaCreds | null, t: TemplateDef): Promise<{ ok: true; id: string; status: string } | { ok: false; error: string; metaCode?: number }> {
  if (!creds?.wabaId) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  if (isDemoId(creds.phoneNumberId)) return { ok: true, id: demoMsgId("tpl"), status: "pending" };
  const { res, data } = await call(creds, `/${creds.wabaId}/message_templates`, { name: t.name, language: t.language, category: t.category, components: templateComponents(t) });
  if (!res.ok || !data?.id) {
    const e = (data?.error ?? {}) as { message?: string; error_user_msg?: string; error_user_title?: string; code?: number };
    return { ok: false, error: e.error_user_msg ?? e.message ?? `Graph API error (${res.status})`, metaCode: e.code };
  }
  return { ok: true, id: String(data.id), status: String(data.status ?? "pending").toLowerCase() };
}

/** Delete a template on Meta (all languages with that name). Missing on Meta counts as deleted. */
export async function deleteTemplateOnMeta(creds: WaCreds | null, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!creds?.wabaId) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  if (isDemoId(creds.phoneNumberId)) return { ok: true };
  const res = await fetch(`${API}/${creds.wabaId}/message_templates?name=${encodeURIComponent(name)}`, { method: "DELETE", headers: { Authorization: `Bearer ${creds.token}` }, signal: AbortSignal.timeout(15000) });
  const d = (await res.json().catch(() => null)) as { success?: boolean; error?: { message?: string; code?: number; error_subcode?: number } } | null;
  if (res.ok && d?.success) return { ok: true };
  if (d?.error?.error_subcode === 2593002 || /not found|does not exist/i.test(d?.error?.message ?? "")) return { ok: true };
  return { ok: false, error: d?.error?.message ?? `Graph API error (${res.status})` };
}

export type MetaTemplate = { metaName: string; status: string; rejectedReason?: string; category?: string; language?: string;
  body?: string; headerFormat?: HeaderFormat; headerText?: string | null; footer?: string | null; buttons?: TplButton[] };
export async function pollTemplates(creds: WaCreds | null): Promise<{ ok: true; templates: MetaTemplate[] } | { ok: false; error: string }> {
  if (!creds?.wabaId) return { ok: false, error: "WhatsApp isn't connected for this workspace" };
  if (isDemoId(creds.phoneNumberId)) return { ok: true, templates: [] };
  const res = await fetch(`${API}/${creds.wabaId}/message_templates?limit=200&fields=name,status,rejected_reason,category,language,components`, { headers: { Authorization: `Bearer ${creds.token}` }, signal: AbortSignal.timeout(15000) });
  type C = { type: string; format?: string; text?: string; buttons?: { type: string; text: string; url?: string; phone_number?: string }[] };
  const data = (await res.json().catch(() => null)) as { data?: { name: string; status: string; rejected_reason?: string; category?: string; language?: string; components?: C[] }[] } | null;
  if (!res.ok || !data) return { ok: false, error: `Graph API error (${res.status})` };
  return { ok: true, templates: (data.data ?? []).map((t) => {
    const c = t.components ?? [], h = c.find((x) => x.type === "HEADER"), b = c.find((x) => x.type === "BODY"), f = c.find((x) => x.type === "FOOTER"), bt = c.find((x) => x.type === "BUTTONS");
    return {
      metaName: t.name, status: t.status.toLowerCase(), rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : undefined,
      category: t.category, language: t.language, body: b?.text,
      headerFormat: (h?.format as HeaderFormat | undefined) ?? "NONE", headerText: h?.format === "TEXT" ? h.text ?? null : null, footer: f?.text ?? null,
      buttons: (bt?.buttons ?? []).filter((x) => ["QUICK_REPLY", "URL", "PHONE_NUMBER"].includes(x.type)).map((x) => ({ type: x.type as TplButton["type"], text: x.text, url: x.url, phone: x.phone_number })),
    };
  }) };
}
