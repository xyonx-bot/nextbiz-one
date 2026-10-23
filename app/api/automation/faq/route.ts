import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

const Pair = z.object({ question: z.string().trim().min(3).max(200), answer: z.string().trim().min(1).max(1024) });

export async function POST(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = Pair.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Question and answer are required." }, { status: 400 });
  const p = getPool();
  const ws = (await p.query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;
  const r = await p.query(
    `INSERT INTO faq_pairs (workspace_id, question, answer) VALUES ($1,$2,$3) RETURNING *`,
    [ws, b.data.question, b.data.answer]);
  return NextResponse.json({ ok: true, pair: r.rows[0] }, { status: 201 });
}
