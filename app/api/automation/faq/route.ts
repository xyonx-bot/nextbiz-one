import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";

const Pair = z.object({ question: z.string().trim().min(3).max(200), answer: z.string().trim().min(1).max(1024) });

export async function POST(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const b = Pair.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Question and answer are required." }, { status: 400 });
  const p = getPool();
  const ws = tn.wsId;
  const r = await p.query(
    `INSERT INTO faq_pairs (workspace_id, question, answer) VALUES ($1,$2,$3) RETURNING *`,
    [ws, b.data.question, b.data.answer]);
  return NextResponse.json({ ok: true, pair: r.rows[0] }, { status: 201 });
}
