import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";
import { AiError, aiGate, complete, type Msg } from "@/lib/ai";
import { PROPOSE_TOOLS, READ_TOOLS, runReadTool, sanitizeCampaignFields, toProposal, type Proposal } from "@/lib/ai-tools";

export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(40),
  context: z.object({ path: z.string().max(200), page: z.string().max(60), title: z.string().max(120).optional(), entity: z.record(z.string(), z.unknown()).optional() }).optional(),
});

function system(biz: string, ctx: z.infer<typeof Body>["context"]): string {
  return [
    `You are NextBiz AI, the assistant inside NextBiz One — a WhatsApp, Instagram and Meta-ads workspace for small businesses in India. You help "${biz}".`,
    `Today is ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })} (India time).`,
    ctx ? `The user is on the "${ctx.page}" page (${ctx.path})${ctx.entity ? `. On screen: ${JSON.stringify(ctx.entity).slice(0, 1500)}` : ""}.` : "",
    "",
    "How you work:",
    "- Use the read tools to look at the user's real data before answering questions about it. Never invent numbers, names or messages.",
    "- You can NOT send, publish, create, delete or change anything yourself. To suggest a change, call a propose_* tool: it shows the user a card they approve. After proposing, say what the card does in one short line (e.g. “Tap Apply to fill the form”). Never say something was sent or created.",
    "- For campaigns: ask for missing essentials one at a time (goal, where, who, budget, what the ad says) unless the user asks you to fill everything. Resolve places with search_ad_locations before proposing them. Fill step by step if the user wants — each propose_campaign_form call can carry just a few fields.",
    "- WhatsApp rules: free-form replies only within 24 hours of the customer's last message; after that only approved templates. Broadcasts only go to opted-in contacts.",
    "- Instagram rules: there are NO templates on Instagram. DMs can be answered within 24 hours of the customer's last message. A comment can always get a public reply, plus ONE private DM reply within 7 days of the comment.",
    "- Costs: WhatsApp marketing templates ≈ ₹0.86 each, utility/authentication ≈ ₹0.12 (+GST); replies within 24h are free up to 1,000/month per number. Instagram and reading data are free. Ad spend is billed by Meta to the ad account.",
    "- When the user wants a reply drafted, ALWAYS deliver it with propose_reply (so they can insert it), even if you also explain something — e.g. that the 24-hour window is closed.",
    "- Never invent business facts (prices, hours, stock, delivery areas, offers). If they're needed and not in the data, ask the user.",
    "- Be brief, warm and practical. Use short paragraphs or bullets. Match the user's language (English, Hindi, Bengali or Hinglish). Use ₹ and Indian number formatting.",
  ].filter(Boolean).join("\n");
}

/** POST — one assistant turn: reads data with tools, returns the reply + action cards awaiting approval. */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  try {
    const cfg = await aiGate(t.wsId);
    const ws = (await getPool().query(`SELECT name FROM workspaces WHERE id = $1`, [t.wsId])).rows[0];
    const msgs: Msg[] = [{ role: "system", content: system(ws?.name ?? "the business", b.data.context) }, ...b.data.messages.map((m) => ({ role: m.role, content: m.content }) as Msg)];
    const actions: Proposal[] = [];
    const used: string[] = [];
    let cost = 0;
    for (let round = 0; round < 7; round++) {
      const r = await complete({ wsId: t.wsId, user: t.user.email, feature: "assistant", model: cfg.assistantModel, messages: msgs, tools: [...READ_TOOLS, ...PROPOSE_TOOLS], maxTokens: 4000 });
      cost += r.usage.cost;
      const calls = r.message.tool_calls ?? [];
      if (!calls.length) {
        // some models write the draft as a quote instead of calling propose_reply — turn it into a card
        const text = (r.message.content ?? "").trim();
        const convId = b.data.context?.entity?.conversation_id;
        if (!actions.some((a) => a.type === "reply") && typeof convId === "string") {
          const quoted = text.split("\n").filter((l) => /^\s*>/.test(l)).map((l) => l.replace(/^\s*>\s?/, "")).join("\n").trim();
          if (quoted.length > 8) actions.push({ id: `q${Date.now().toString(36)}`, type: "reply", summary: "Suggested reply", payload: { conversation_id: convId, text: quoted } });
        }
        return NextResponse.json({ ok: true, reply: (r.message.content ?? "").trim() || (actions.length ? "Here's my suggestion — review it below." : "I couldn't come up with an answer — try rephrasing?"), actions, tools: used, cost, model: r.model });
      }
      msgs.push({ role: "assistant", content: r.message.content ?? null, tool_calls: calls });
      for (const c of calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(c.function.arguments || "{}"); } catch { /* bad JSON from the model */ }
        used.push(c.function.name);
        let out: unknown;
        if (c.function.name.startsWith("propose_")) {
          let dropped: string[] = [];
          if (c.function.name === "propose_campaign_form") { const s = await sanitizeCampaignFields(t.wsId, args); args = s.fields; dropped = s.dropped; }
          const p = toProposal(c.function.name, args, actions.length);
          if (p) actions.push(p);
          out = { shown_to_user: true, status: "waiting for the user to approve — nothing has been done yet", ...(dropped.length ? { removed_unknown_locations: dropped, tell_user: "these places weren't found — ask them to pick locations in the form" } : {}) };
        } else {
          out = await runReadTool(c.function.name, args, t.wsId).catch((e: Error) => ({ error: e.message }));
        }
        msgs.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 12000) });
      }
    }
    return NextResponse.json({ ok: true, reply: actions.length ? "Here's what I put together — review it below." : "That took too many steps — could you narrow the question?", actions, tools: used, cost });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("Something went wrong with the AI.");
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
