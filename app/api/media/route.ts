import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";
import { MEDIA_RULES } from "@/lib/templates";

/** POST multipart { file, kind: IMAGE|VIDEO|DOCUMENT } — stores a template header file for this workspace. */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file"), kind = String(fd?.get("kind") ?? "IMAGE") as keyof typeof MEDIA_RULES;
  const rule = MEDIA_RULES[kind];
  if (!rule) return NextResponse.json({ error: "Unknown file kind." }, { status: 400 });
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (!rule.mimes.includes(file.type)) return NextResponse.json({ error: `Use a ${rule.label}.` }, { status: 415 });
  if (file.size > rule.max) return NextResponse.json({ error: `Too big — use a ${rule.label}.` }, { status: 413 });
  const name = ((file as File).name || "file").replace(/[^\w.\- ]/g, "_").slice(0, 120);
  const r = await getPool().query(
    `INSERT INTO media_files (workspace_id, name, mime, size, bytes) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, mime, size`,
    [t.wsId, name, file.type, file.size, Buffer.from(await file.arrayBuffer())]);
  return NextResponse.json({ ok: true, media: { ...r.rows[0], url: `/api/media/${r.rows[0].id}` } }, { status: 201 });
}
