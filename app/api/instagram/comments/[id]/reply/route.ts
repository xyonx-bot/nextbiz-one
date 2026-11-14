import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { ensureThread, igPrivateReply, igPublicReply, recordOutbound } from "@/lib/instagram";

/**
 * POST { kind: "public" | "private", text } — reply to a comment by hand.
 * Public = a reply under the comment. Private = a DM to the commenter; Instagram allows ONE private reply
 * per comment, within 7 days of it — enforced here so people get a clear message instead of a Meta error.
 */
const Body = z.object({ kind: z.enum(["public", "private"]), text: z.string().trim().min(1).max(1000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Write a reply first (max 1000 characters)." }, { status: 400 });
  const p = getPool();
  const c = (await p.query(
    `SELECT c.id, c.comment_id, c.from_id, c.from_name, c.dm_status, c.reply_kind, c.created_at, a.id AS account_id
       FROM ig_comments c JOIN ig_accounts a ON a.id = c.ig_account_id WHERE c.id = $1 AND a.workspace_id = $2`, [id, t.wsId])).rows[0];
  if (!c) return notFound();

  if (b.data.kind === "private") {
    if (c.dm_status === "sent" || c.reply_kind === "private")
      return NextResponse.json({ error: "Instagram allows one private reply per comment — this person already got one. Continue in their DMs." }, { status: 409 });
    if (Date.now() - new Date(c.created_at).getTime() > 7 * 86400_000)
      return NextResponse.json({ error: "Private replies are only possible within 7 days of the comment. Reply publicly instead." }, { status: 409 });
  }
  const s = b.data.kind === "public" ? await igPublicReply(c.account_id, c.comment_id, b.data.text) : await igPrivateReply(c.account_id, c.comment_id, b.data.text);
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 422 });

  await p.query(
    `UPDATE ig_comments SET reply_text = $2, reply_kind = $3, replied_at = now(), hidden_at = NULL,
            dm_status = CASE WHEN $3 = 'private' THEN 'sent' ELSE dm_status END WHERE id = $1`, [id, b.data.text, b.data.kind]);
  let threadId: string | null = null;
  if (b.data.kind === "private" && c.from_id) {
    // the private reply opens a DM thread with the commenter — it shows up in the inbox
    const th = await ensureThread(t.wsId, c.account_id, c.from_id, c.from_name ?? null);
    await recordOutbound(t.wsId, c.account_id, th.id, s.mid, b.data.text, "app", "sent");
    threadId = th.id;
  }
  return NextResponse.json({ ok: true, threadId });
}
