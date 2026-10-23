/** Thin WhatsApp Graph API client (technical-plan §2) — version-pinned,
 *  typed errors, no business logic. Sender + future template calls. */
const API = "https://graph.facebook.com/v21.0";

export type SendResult =
  | { ok: true; waMessageId: string }
  | { ok: false; error: string; metaCode?: number };

export async function sendText(toWaId: string, body: string): Promise<SendResult> {
  const token = process.env.META_ACCESS_TOKEN;
  const from = process.env.PHONE_NUMBER_ID;
  if (!token || !from) return { ok: false, error: "WhatsApp connection not configured" };
  const res = await fetch(`${API}/${from}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  const data = (await res.json().catch(() => null)) as
    | { messages?: { id: string }[]; error?: { message?: string; code?: number } }
    | null;
  if (!res.ok || !data?.messages?.[0]?.id) {
    return { ok: false, error: data?.error?.message ?? `Graph API error (${res.status})`, metaCode: data?.error?.code };
  }
  return { ok: true, waMessageId: data.messages[0].id };
}

/** Template submit + status poll (S2/P1.8) — thin, version-pinned. */
export async function submitTemplate(t: {
  name: string; language: string; category: string; bodyText: string;
}): Promise<{ ok: true; id: string; status: string } | { ok: false; error: string; metaCode?: number }> {
  const token = process.env.META_ACCESS_TOKEN;
  const waba = process.env.WABA_ID;
  if (!token || !waba) return { ok: false, error: "WhatsApp connection not configured" };
  const res = await fetch(`https://graph.facebook.com/v21.0/${waba}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: t.name, language: t.language, category: t.category,
      components: [{ type: "BODY", text: t.bodyText }],
    }),
  });
  const data = (await res.json().catch(() => null)) as
    | { id?: string; status?: string; error?: { message?: string; code?: number } }
    | null;
  if (!res.ok || !data?.id) {
    return { ok: false, error: data?.error?.message ?? `Graph API error (${res.status})`, metaCode: data?.error?.code };
  }
  return { ok: true, id: data.id, status: data.status ?? "pending" };
}

export async function pollTemplates(): Promise<
  { ok: true; templates: { metaName: string; status: string; rejectedReason?: string }[] } | { ok: false; error: string }
> {
  const token = process.env.META_ACCESS_TOKEN;
  const waba = process.env.WABA_ID;
  if (!token || !waba) return { ok: false, error: "WhatsApp connection not configured" };
  const res = await fetch(`https://graph.facebook.com/v21.0/${waba}/message_templates?limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => null)) as
    | { data?: { name: string; status: string; rejected_reason?: string }[] }
    | null;
  if (!res.ok || !data) return { ok: false, error: `Graph API error (${res.status})` };
  return {
    ok: true,
    templates: (data.data ?? []).map((t) => ({
      metaName: t.name, status: t.status.toLowerCase(), rejectedReason: t.rejected_reason,
    })),
  };
}
