import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenant, unauthorized } from "@/lib/tenant";
import { AiError, aiGate, complete, type Msg } from "@/lib/ai";
import { PROPOSE_TOOLS, READ_TOOLS, runReadTool, sanitizeCampaignFields } from "@/lib/ai-tools";

export const maxDuration = 90;
const Body = z.object({ prompt: z.string().trim().min(3).max(2000), current: z.record(z.string(), z.unknown()).optional() });

/**
 * POST — "describe your ad" → proposed values for the campaign builder (locations resolved through Meta).
 * Returns fields only; the builder shows what changed and the user reviews + publishes themselves.
 */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Describe the ad in a few words." }, { status: 400 });
  try {
    const cfg = await aiGate(t.wsId);
    const tools = [...READ_TOOLS.filter((x) => ["search_ad_locations", "search_ad_interests"].includes(x.function.name)), ...PROPOSE_TOOLS.filter((x) => x.function.name === "propose_campaign_form")];
    const msgs: Msg[] = [
      { role: "system", content: `You fill a Meta ad campaign form for a small business in India. Read the request, look up every place with search_ad_locations (and interests with search_ad_interests if the user mentions them), then call propose_campaign_form ONCE with the fields the request implies. Write catchy but honest ad text (headline under 40 characters, primary text under 125) in the user's language. Don't invent offers or prices the user didn't give. Budget is INR per day (min 100). If a place can't be found, leave it out. Today: ${new Date().toISOString().slice(0, 10)}.` },
      { role: "user", content: `Request: ${b.data.prompt}${b.data.current ? `\n\nAlready in the form: ${JSON.stringify(b.data.current).slice(0, 1500)}` : ""}` },
    ];
    for (let round = 0; round < 6; round++) {
      const r = await complete({ wsId: t.wsId, user: t.user.email, feature: "campaign_fill", model: cfg.quickModel, messages: msgs, tools, maxTokens: 3000, temperature: 0.5, reasoning: "low" });
      const calls = r.message.tool_calls ?? [];
      if (!calls.length) return NextResponse.json({ error: (r.message.content ?? "").trim() || "The AI couldn't fill the form — add a bit more detail." }, { status: 422 });
      msgs.push({ role: "assistant", content: r.message.content ?? null, tool_calls: calls });
      for (const c of calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(c.function.arguments || "{}"); } catch { /* ignore */ }
        if (c.function.name === "propose_campaign_form") {
          const { summary, ...raw } = args;
          const { fields, dropped } = await sanitizeCampaignFields(t.wsId, raw);
          return NextResponse.json({ ok: true, summary: dropped.length ? `${summary ?? "Filled"} (couldn't find: ${dropped.join(", ")} — pick those locations yourself)` : summary ?? null, fields });
        }
        const out = await runReadTool(c.function.name, args, t.wsId).catch((e: Error) => ({ error: e.message }));
        msgs.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 8000) });
      }
    }
    return NextResponse.json({ error: "The AI took too many steps — try a shorter description." }, { status: 422 });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("Something went wrong with the AI.");
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
