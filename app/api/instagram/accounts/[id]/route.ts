import { NextResponse } from "next/server";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { deletePastIgAccount } from "@/lib/instagram";

/** DELETE { confirm: "DELETE" } — permanently delete a disconnected account's chats, messages and comments. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const b = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (b?.confirm !== "DELETE") return NextResponse.json({ error: "Confirm the deletion first." }, { status: 400 });
  if (!(await deletePastIgAccount(t.wsId, id))) return notFound();
  return NextResponse.json({ ok: true });
}
