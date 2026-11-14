import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, isUuid } from "@/lib/tenant";
import { AiError, aiGate, complete, parseJson } from "@/lib/ai";

export const maxDuration = 60;
const Body = z.object({ kind: z.enum(["wa", "ig", "comment"]), id: z.string().max(80), draft: z.string().max(2000).optional() });

/**
 * POST — three reply suggestions (short · friendly · detailed) for a WhatsApp chat, an Instagram DM or an
 * Instagram comment. Suggestions only: the user picks one into the reply box and sends it themselves.
 */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const p = getPool();
  const { kind } = b.data;
  const id = kind === "ig" ? b.data.id.replace(/^ig:/, "") : b.data.id;
  if (!isUuid(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let transcript = "", who = "the customer", channel = "WhatsApp";
  if (kind === "wa") {
    const c = (await p.query(`SELECT c.id, ct.name, ct.wa_id FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE c.id=$1 AND c.workspace_id=$2`, [id, t.wsId])).rows[0];
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    who = c.name ?? "the customer";
    const m = (await p.query(`SELECT direction, body, type FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 20`, [id])).rows.reverse();
    transcript = m.map((x) => `${x.direction === "in" ? "Customer" : "Business"}: ${x.body ?? `[${x.type}]`}`).join("\n");
  } else if (kind === "ig") {
    channel = "Instagram DM";
    const th = (await p.query(`SELECT id, username, name FROM ig_threads WHERE id=$1 AND workspace_id=$2`, [id, t.wsId])).rows[0];
    if (!th) return NextResponse.json({ error: "not found" }, { status: 404 });
    who = th.username ? `@${th.username}` : th.name ?? "the customer";
    const m = (await p.query(`SELECT direction, body FROM ig_messages WHERE thread_id=$1 ORDER BY created_at DESC LIMIT 20`, [id])).rows.reverse();
    transcript = m.map((x) => `${x.direction === "in" ? "Customer" : "Business"}: ${x.body ?? "[media]"}`).join("\n");
  } else {
    channel = "Instagram comment";
    const c = (await p.query(`SELECT c.from_name, c.text, c.media_id, c.raw FROM ig_comments c JOIN ig_accounts a ON a.id=c.ig_account_id WHERE c.id=$1 AND a.workspace_id=$2`, [id, t.wsId])).rows[0];
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    who = c.from_name ? `@${c.from_name}` : "the commenter";
    transcript = `Comment on our post by ${who}: ${c.text ?? ""}`;
  }
  try {
    const cfg = await aiGate(t.wsId);
    const ws = (await p.query(`SELECT name, about FROM workspaces WHERE id=$1`, [t.wsId])).rows[0];
    const r = await complete({
      wsId: t.wsId, user: t.user.email, feature: "suggest", model: cfg.quickModel, maxTokens: 2500, temperature: 0.7, reasoning: "low",
      messages: [
        { role: "system", content: `You write ${channel} replies for "${ws?.name ?? "a small business"}"${ws?.about ? ` (${ws.about})` : ""} in India. Write as the business, to ${who}. Match the customer's language (English, Hindi, Bengali or Hinglish). Never invent prices, stock, opening hours, addresses, delivery areas or promises that aren't in the conversation — if information is missing, ask the customer or offer to check. ${kind === "comment" ? "Comment replies are public: keep them short and invite a DM for details." : ""}
Return ONLY JSON: {"suggestions":[{"tone":"short","text":"…"},{"tone":"friendly","text":"…"},{"tone":"detailed","text":"…"}]}` },
        { role: "user", content: `${transcript}${b.data.draft ? `\n\nThe business started typing: "${b.data.draft}" — improve or continue it.` : ""}\n\nWrite the three reply options now.` },
      ],
    });
    const j = parseJson<{ suggestions?: { tone?: string; text?: string }[] }>(r.message.content);
    const suggestions = (j?.suggestions ?? []).filter((s) => s.text?.trim()).slice(0, 3).map((s) => ({ tone: s.tone ?? "", text: s.text!.trim() }));
    if (!suggestions.length) return NextResponse.json({ error: "The AI didn't return suggestions — try again." }, { status: 422 });
    return NextResponse.json({ ok: true, suggestions });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("Something went wrong with the AI.");
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
