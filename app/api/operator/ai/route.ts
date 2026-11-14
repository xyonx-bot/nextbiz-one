import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { aiConfig, aiKeyPresent, saveAiConfig } from "@/lib/ai";

async function operator() { const u = await getSessionUser((await cookies()).get("nbo_session")?.value); return u?.isOperator ? u : null; }

let models: { at: number; list: { id: string; name: string; free: boolean; inPerM: number; outPerM: number; ctx: number }[] } | null = null;
async function modelList() {
  if (models && Date.now() - models.at < 3600_000) return models.list;
  const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15000) }).then((x) => x.json()).catch(() => null) as { data?: { id: string; name: string; context_length?: number; supported_parameters?: string[]; pricing: { prompt: string; completion: string } }[] } | null;
  const list = (r?.data ?? []).filter((m) => (m.supported_parameters ?? []).includes("tools"))
    .map((m) => ({ id: m.id, name: m.name, free: m.id.endsWith(":free") || (Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0), inPerM: Math.round(Number(m.pricing.prompt) * 1e8) / 100, outPerM: Math.round(Number(m.pricing.completion) * 1e8) / 100, ctx: m.context_length ?? 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (list.length) models = { at: Date.now(), list };
  return list;
}

/** GET — AI settings, model catalogue (tool-calling models on OpenRouter), usage by workspace. Operator only. */
export async function GET() {
  if (!(await operator())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = getPool();
  const [cfg, list, today, month, byWs] = await Promise.all([
    aiConfig(), modelList(),
    p.query(`SELECT count(*)::int AS calls, COALESCE(sum(cost_usd),0)::float AS cost, count(*) FILTER (WHERE NOT ok)::int AS failed FROM ai_usage WHERE created_at > date_trunc('day', now())`).then((r) => r.rows[0]),
    p.query(`SELECT count(*)::int AS calls, COALESCE(sum(cost_usd),0)::float AS cost, COALESCE(sum(prompt_tokens + completion_tokens),0)::bigint AS tokens FROM ai_usage WHERE created_at > now() - interval '30 days'`).then((r) => r.rows[0]),
    p.query(`SELECT w.name, count(*)::int AS calls, COALESCE(sum(u.cost_usd),0)::float AS cost, max(u.created_at) AS last FROM ai_usage u JOIN workspaces w ON w.id = u.workspace_id
              WHERE u.created_at > now() - interval '30 days' GROUP BY w.name ORDER BY calls DESC LIMIT 20`).then((r) => r.rows),
  ]);
  return NextResponse.json({ ok: true, keyPresent: aiKeyPresent(), config: cfg, models: list, usage: { today, month, byWorkspace: byWs } }, { headers: { "Cache-Control": "no-store" } });
}

const Put = z.object({
  enabled: z.boolean().optional(),
  assistantModel: z.string().regex(/^[\w.-]+\/[\w.:-]+$/).optional(),
  quickModel: z.string().regex(/^[\w.-]+\/[\w.:-]+$/).optional(),
  fallbackModel: z.union([z.literal(""), z.string().regex(/^[\w.-]+\/[\w.:-]+$/)]).optional(),
  dailyLimit: z.number().int().min(0).max(100000).optional(),
});
export async function PUT(req: Request) {
  const u = await operator();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = Put.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  const known = new Set((await modelList()).map((m) => m.id));
  for (const m of [b.data.assistantModel, b.data.quickModel, b.data.fallbackModel]) if (m && known.size && !known.has(m)) return NextResponse.json({ error: `${m} isn't a tool-calling model on OpenRouter.` }, { status: 400 });
  const next = await saveAiConfig(b.data, u.email);
  await getPool().query(`INSERT INTO audit_log (actor_email, action, target, reason) VALUES ($1, 'ai_settings', 'NextBiz AI', $2)`, [u.email, JSON.stringify(b.data).slice(0, 300)]).catch(() => {});
  return NextResponse.json({ ok: true, config: next });
}
