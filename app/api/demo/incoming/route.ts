import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";
import { processInbound } from "@/lib/webhook";
import { processIgInbound } from "@/lib/instagram";
import { demoMsgId, isDemoId } from "@/lib/demo";

/**
 * Demo workspaces only: make a customer message arrive, through the same pipeline as a real Meta webhook
 * (so the inbox updates live and welcome/keyword automation runs). For recording promo videos.
 * POST { channel: "whatsapp" | "instagram" | "comment", name, handle?, text }
 */
const Body = z.object({
  channel: z.enum(["whatsapp", "instagram", "comment"]),
  name: z.string().trim().min(1).max(60),
  handle: z.string().trim().max(40).optional(),   // WhatsApp number (digits) or Instagram username
  text: z.string().trim().min(1).max(1000),
  post: z.number().int().min(1).max(6).optional(), // which demo post a comment is on
});

export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Send channel, name and text." }, { status: 400 });
  const p = getPool();
  const d = b.data, now = Math.floor(Date.now() / 1000);

  if (d.channel === "whatsapp") {
    const wa = (await p.query(`SELECT phone_number_id, display_name FROM waba_connections WHERE workspace_id = $1 AND status = 'connected' LIMIT 1`, [t.wsId])).rows[0];
    if (!isDemoId(wa?.phone_number_id)) return NextResponse.json({ error: "Only available in a demo workspace." }, { status: 403 });
    // same name → same number, so a follow-up lands in the same chat
    const known = (await p.query(`SELECT wa_id FROM contacts WHERE workspace_id = $1 AND lower(name) = lower($2) LIMIT 1`, [t.wsId, d.name])).rows[0]?.wa_id;
    const waId = d.handle?.replace(/\D/g, "") || known || `9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    await processInbound({ object: "whatsapp_business_account", entry: [{ id: "demo", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { phone_number_id: wa.phone_number_id, display_phone_number: "demo" },
      contacts: [{ profile: { name: d.name }, wa_id: waId }],
      messages: [{ from: waId, id: demoMsgId("in"), timestamp: String(now), type: "text", text: { body: d.text } }],
    } }] }] }, true);
    return NextResponse.json({ ok: true, waId });
  }

  const ig = (await p.query(`SELECT ig_user_id FROM ig_accounts WHERE workspace_id = $1 AND live LIMIT 1`, [t.wsId])).rows[0];
  if (!isDemoId(ig?.ig_user_id)) return NextResponse.json({ error: "Only available in a demo workspace." }, { status: 403 });
  const username = (d.handle || d.name).replace(/^@/, "").toLowerCase().replace(/[^a-z0-9._]/g, "") || "customer";
  const known = (await p.query(`SELECT igsid FROM ig_threads WHERE workspace_id = $1 AND username = $2 LIMIT 1`, [t.wsId, username])).rows[0]?.igsid;
  const igsid = known ?? `demo-igsid-${username}`;
  if (d.channel === "instagram") {
    await processIgInbound({ object: "instagram", entry: [{ id: ig.ig_user_id, time: now, messaging: [{
      sender: { id: igsid, username }, recipient: { id: ig.ig_user_id }, timestamp: now * 1000, message: { mid: demoMsgId("igm"), text: d.text },
    }] }] }, true);
    // the webhook doesn't carry a display name; set it so the inbox shows "Priya Nair", not the handle
    await p.query(`UPDATE ig_threads SET name = COALESCE(name, $3), username = COALESCE(username, $4) WHERE workspace_id = $1 AND igsid = $2`, [t.wsId, igsid, d.name, username]);
  } else {
    await processIgInbound({ object: "instagram", entry: [{ id: ig.ig_user_id, time: now, changes: [{ field: "comments", value: {
      id: demoMsgId("cmt"), text: d.text, from: { id: igsid, username }, media: { id: `demo-media-post-${d.post ?? 1}` },
    } }] }] }, true);
  }
  return NextResponse.json({ ok: true, username });
}
