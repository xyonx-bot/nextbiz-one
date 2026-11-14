/**
 * NextBiz AI — OpenRouter client (OpenAI-compatible chat completions + tool calls).
 * The operator picks the models in the console (platform_settings 'ai'); every call is logged with its
 * cost (OpenRouter returns it) and each workspace has a daily request limit so a client can't run up the bill.
 * The key lives only in the server env (OPENROUTER_API_KEY).
 */
import { getPool } from "./db";

export type AiConfig = { enabled: boolean; assistantModel: string; quickModel: string; fallbackModel: string; dailyLimit: number };
/** Default: NVIDIA Nemotron 3.5 Super VL (free on OpenRouter: tool calling, structured output, images). Free models are rate-limited — the operator can
 *  set a paid fallback that's used only when the free one is busy or failing. */
export const AI_DEFAULTS: AiConfig = { enabled: true, assistantModel: "nvidia/nemotron-3.5-super-vl:free", quickModel: "nvidia/nemotron-3.5-super-vl:free", fallbackModel: "", dailyLimit: 200 };

let cfgCache: { at: number; v: AiConfig } | null = null;
export async function aiConfig(): Promise<AiConfig> {
  if (cfgCache && Date.now() - cfgCache.at < 30_000) return cfgCache.v;
  const r = await getPool().query(`SELECT value FROM platform_settings WHERE key = 'ai'`).catch(() => ({ rows: [] }));
  const v = { ...AI_DEFAULTS, ...((r.rows[0]?.value as Partial<AiConfig>) ?? {}) };
  cfgCache = { at: Date.now(), v };
  return v;
}
export async function saveAiConfig(v: Partial<AiConfig>, by: string) {
  const cur = await aiConfig();
  const next = { ...cur, ...v };
  await getPool().query(
    `INSERT INTO platform_settings (key, value, updated_by) VALUES ('ai', $1::jsonb, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`, [JSON.stringify(next), by]);
  cfgCache = null;
  return next;
}
export const aiKeyPresent = () => (process.env.OPENROUTER_API_KEY ?? "").startsWith("sk-or-");
export async function aiAvailable() { return aiKeyPresent() && (await aiConfig()).enabled; }

export async function usedToday(wsId: string): Promise<number> {
  const { rows } = await getPool().query(`SELECT count(*)::int AS n FROM ai_usage WHERE workspace_id = $1 AND created_at > date_trunc('day', now())`, [wsId]);
  return rows[0]?.n ?? 0;
}

export type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

export class AiError extends Error { constructor(msg: string, public status = 422) { super(msg); } }

/** One chat completion. Logs usage (and failures) against the workspace. */
export async function complete(opts: {
  wsId: string; user: string; feature: "assistant" | "suggest" | "campaign_fill";
  model: string; messages: Msg[]; tools?: ToolDef[]; maxTokens?: number; temperature?: number; reasoning?: "low" | "medium" | "high";
}): Promise<{ message: { content: string | null; tool_calls?: ToolCall[] }; usage: { prompt: number; completion: number; cost: number }; model: string }> {
  if (!aiKeyPresent()) throw new AiError("AI isn't set up on this server yet.", 409);
  try { return await completeOnce(opts); }
  catch (e) {
    // free models get rate-limited — retry once on the operator's fallback model, if one is set
    const fb = (await aiConfig()).fallbackModel;
    if (fb && fb !== opts.model) return completeOnce({ ...opts, model: fb });
    throw e;
  }
}

async function completeOnce(opts: Parameters<typeof complete>[0]): Promise<Awaited<ReturnType<typeof complete>>> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": process.env.PUBLIC_URL ?? "https://one.nextbizstudio.com", "X-Title": "NextBiz One" },
    body: JSON.stringify({
      // reasoning models spend output tokens thinking first — keep room for the actual answer
      model: opts.model, messages: opts.messages, max_tokens: opts.maxTokens ?? 3000, temperature: opts.temperature ?? 0.4,
      ...(opts.reasoning ? { reasoning: { effort: opts.reasoning } } : {}),
      usage: { include: true },
      ...(opts.tools?.length ? { tools: opts.tools, tool_choice: "auto" } : {}),
    }),
    signal: AbortSignal.timeout(90_000),
  }).catch((e: Error) => { throw new AiError(`Couldn't reach the AI service: ${e.message}`); });
  const j = (await res.json().catch(() => ({}))) as {
    choices?: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }; error?: { message?: string };
  };
  const usage = { prompt: j.usage?.prompt_tokens ?? 0, completion: j.usage?.completion_tokens ?? 0, cost: j.usage?.cost ?? 0 };
  const ok = res.ok && !!j.choices?.[0];
  await getPool().query(
    `INSERT INTO ai_usage (workspace_id, user_email, feature, model, prompt_tokens, completion_tokens, cost_usd, ok, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [opts.wsId, opts.user, opts.feature, opts.model, usage.prompt, usage.completion, usage.cost, ok, ok ? null : (j.error?.message ?? `HTTP ${res.status}`).slice(0, 300)]).catch(() => {});
  if (!ok) throw new AiError(`The AI model didn't answer: ${j.error?.message ?? res.status}`);
  return { message: j.choices![0].message, usage, model: opts.model };
}

/** Gate for every AI route: enabled, key present, under the workspace's daily limit. */
export async function aiGate(wsId: string): Promise<AiConfig> {
  const cfg = await aiConfig();
  if (!aiKeyPresent()) throw new AiError("AI isn't set up on this server yet.", 409);
  if (!cfg.enabled) throw new AiError("AI is switched off for now.", 409);
  if ((await usedToday(wsId)) >= cfg.dailyLimit) throw new AiError(`Today's AI limit (${cfg.dailyLimit} requests) is used up — it resets at midnight.`, 429);
  return cfg;
}

/** Pull a JSON object out of a model reply (tolerates ```json fences and stray text). */
export function parseJson<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  const t = s.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)) as T; } catch { return null; }
}
