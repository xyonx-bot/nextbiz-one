/**
 * NextBiz AI — the assistant's tools.
 *  · READ tools run on the server, scoped to the signed-in workspace, and return compact JSON.
 *  · PROPOSE tools never change anything: they become action cards the user approves (Apply / Create /
 *    Insert). The model is told this explicitly, so it never claims to have done something itself.
 */
import { getPool } from "./db";
import type { ToolDef } from "./ai";
import { adsConnection, liveCampaigns } from "./meta-ads";
import { searchInterests } from "./meta-ads-create";
import { findLocations, verifyLocations } from "./ads-locations";
import { listComments } from "./social";

export type Proposal = { id: string; type: "campaign_form" | "reply" | "keyword_rule" | "template"; summary: string; payload: Record<string, unknown> };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

export const READ_TOOLS: ToolDef[] = [
  { type: "function", function: { name: "get_overview", description: "Snapshot of the business: chats (WhatsApp + Instagram), unread, contacts, opt-ins, templates, recent broadcasts, Instagram comments waiting, connected channels, ads spend.", parameters: obj({}) } },
  { type: "function", function: { name: "list_conversations", description: "Recent chats with last message. Use to find a chat or see what needs a reply.", parameters: obj({ channel: { type: "string", enum: ["all", "whatsapp", "instagram"] }, unread_only: { type: "boolean" }, limit: num("max 30") }) } },
  { type: "function", function: { name: "get_conversation", description: "Messages of one chat (oldest→newest). id is a WhatsApp conversation id or 'ig:<thread id>' for Instagram.", parameters: obj({ id: str("conversation id"), limit: num("messages, max 60") }, ["id"]) } },
  { type: "function", function: { name: "search_contacts", description: "Find contacts by name, number or tag.", parameters: obj({ q: str("search text"), limit: num("max 25") }, ["q"]) } },
  { type: "function", function: { name: "list_templates", description: "WhatsApp message templates with status (approved/pending/rejected/draft).", parameters: obj({}) } },
  { type: "function", function: { name: "list_keyword_rules", description: "Automation keyword rules and where they run.", parameters: obj({}) } },
  { type: "function", function: { name: "list_instagram_comments", description: "Instagram comments; filter needs = waiting for a reply.", parameters: obj({ filter: { type: "string", enum: ["needs", "auto", "replied", "all"] }, limit: num("max 30") }) } },
  { type: "function", function: { name: "list_ad_campaigns", description: "Ad campaigns (live from Meta when an ad account is connected) with last-7-day spend and results.", parameters: obj({}) } },
  { type: "function", function: { name: "search_ad_locations", description: "Resolve a place name to Meta ad targeting locations (city/state/PIN/country). Always use this before proposing campaign locations.", parameters: obj({ q: str("place, e.g. Kolkata, 700091, West Bengal") }, ["q"]) } },
  { type: "function", function: { name: "search_ad_interests", description: "Find Meta interest targeting options by keyword.", parameters: obj({ q: str("keyword, e.g. bakery") }, ["q"]) } },
];

export const PROPOSE_TOOLS: ToolDef[] = [
  { type: "function", function: { name: "propose_campaign_form", description: "Propose values for the ad campaign builder. The user sees a card and clicks Apply to fill the form; they publish themselves. Include only fields you are setting. Locations must come from search_ad_locations.", parameters: obj({
    summary: str("one line describing what you're filling"),
    name: str("campaign name"), goal: { type: "string", enum: ["whatsapp", "instagram_dm", "website"] },
    locations: { type: "array", items: obj({ key: str("Meta location key"), type: str("country|region|city|zip"), name: str("display name"), radiusKm: num("10–80, cities only") }, ["key", "type", "name"]) },
    ageMin: num("18–65"), ageMax: num("18–65"), genders: { type: "string", enum: ["all", "men", "women"] },
    interests: { type: "array", items: obj({ id: str("Meta interest id"), name: str("name") }, ["id", "name"]) },
    primaryText: str("main ad text, ideally under 125 characters"), headline: str("under 40 characters"), description: str("optional"),
    websiteUrl: str("for website goal"), dailyBudget: num("INR per day, min 100"),
  }, ["summary"]) } },
  { type: "function", function: { name: "propose_reply", description: "Propose a reply for a chat. The user sees it and can insert it into the reply box; they send it themselves. Never claim it was sent.", parameters: obj({ conversation_id: str("conversation id (WhatsApp) or 'ig:<id>'"), text: str("the reply"), summary: str("one line, e.g. 'Reply to Priya about delivery'") }, ["text", "summary"]) } },
  { type: "function", function: { name: "propose_keyword_rule", description: "Propose an automation keyword rule. Created only when the user clicks Create.", parameters: obj({
    summary: str("one line"), name: str("rule name"), keywords: { type: "array", items: { type: "string" } }, reply: str("auto-reply text"),
    onWhatsapp: { type: "boolean" }, onInstagramDm: { type: "boolean" }, onInstagramComment: { type: "boolean" }, commentPublicReply: str("optional public reply under Instagram comments"),
  }, ["summary", "name", "keywords", "reply"]) } },
  { type: "function", function: { name: "propose_template", description: "Propose a WhatsApp template draft (lowercase_name_with_underscores, MARKETING or UTILITY, body with {{1}} variables). Saved as a draft only when the user clicks Save; submitting to Meta is a separate step.", parameters: obj({
    summary: str("one line"), name: str("lowercase_with_underscores"), category: { type: "string", enum: ["MARKETING", "UTILITY"] }, language: str("e.g. en, hi, en_US"), body: str("template text"),
  }, ["summary", "name", "category", "language", "body"]) } },
];

const cut = (s: unknown, n = 300) => (typeof s === "string" ? (s.length > n ? `${s.slice(0, n)}…` : s) : s);

export async function runReadTool(name: string, args: Record<string, unknown>, wsId: string): Promise<unknown> {
  const p = getPool();
  const lim = (v: unknown, d: number, m: number) => Math.max(1, Math.min(m, Number(v) || d));
  switch (name) {
    case "get_overview": {
      const one = async (sql: string) => (await p.query(sql, [wsId])).rows[0] ?? {};
      const [chats, contacts, tpl, bc, ig, conn] = await Promise.all([
        one(`SELECT (SELECT count(*)::int FROM conversations WHERE workspace_id=$1 AND last_inbound_at > now() - interval '7 days') AS wa_active_7d,
                    (SELECT count(*)::int FROM conversations c WHERE c.workspace_id=$1 AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.direction='in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0)))) AS wa_unread_chats,
                    (SELECT count(*)::int FROM ig_threads t WHERE t.ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND EXISTS (SELECT 1 FROM ig_messages m WHERE m.thread_id=t.id AND m.direction='in' AND m.created_at > COALESCE(t.last_read_at, to_timestamp(0)))) AS ig_unread_chats,
                    (SELECT count(*)::int FROM conversations WHERE workspace_id=$1 AND last_inbound_at BETWEEN now() - interval '24 hours' AND now() - interval '20 hours') AS wa_windows_closing_soon`),
        one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE opt_in)::int AS opted_in, count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_7d FROM contacts WHERE workspace_id=$1`),
        one(`SELECT count(*) FILTER (WHERE lower(status)='approved')::int AS approved, count(*) FILTER (WHERE lower(status)='pending')::int AS pending, count(*) FILTER (WHERE lower(status)='rejected')::int AS rejected FROM templates WHERE workspace_id=$1`),
        p.query(`SELECT name, status, sent_at FROM broadcasts WHERE workspace_id=$1 ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 3`, [wsId]).then((r) => r.rows),
        one(`SELECT count(*)::int AS comments_needing_reply FROM ig_comments c JOIN ig_accounts a ON a.id=c.ig_account_id WHERE a.workspace_id=$1 AND a.live AND c.replied_at IS NULL AND c.owner_replied_at IS NULL
               AND COALESCE(c.dm_status,'') <> 'sent' AND COALESCE(c.public_status,'') <> 'sent' AND c.hidden_at IS NULL AND c.ig_hidden_at IS NULL AND c.created_at > now() - interval '7 days' AND (c.from_id IS NULL OR c.from_id <> a.ig_user_id)`),
        one(`SELECT (SELECT status FROM waba_connections WHERE workspace_id=$1 ORDER BY (status='connected') DESC LIMIT 1) AS whatsapp,
                    (SELECT username FROM ig_accounts WHERE workspace_id=$1 AND live LIMIT 1) AS instagram,
                    (SELECT name FROM ads_connections WHERE workspace_id=$1) AS ad_account`),
      ]);
      return { today: new Date().toISOString().slice(0, 10), chats, contacts, templates: tpl, recent_broadcasts: bc, instagram: ig, connected: conn };
    }
    case "list_conversations": {
      const ch = String(args.channel ?? "all"), unread = !!args.unread_only, n = lim(args.limit, 15, 30);
      const wa = ch === "instagram" ? [] : (await p.query(
        `SELECT c.id, ct.name, ct.wa_id AS handle, 'whatsapp' AS channel, lm.body AS last_message, lm.direction AS last_from, lm.created_at AS last_at, c.last_inbound_at,
                (SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.direction='in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))) AS unread
           FROM conversations c JOIN contacts ct ON ct.id=c.contact_id
           JOIN LATERAL (SELECT body, direction, created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY created_at DESC LIMIT 1) lm ON true
          WHERE c.workspace_id=$1 ORDER BY lm.created_at DESC LIMIT $2`, [wsId, n])).rows;
      const ig = ch === "whatsapp" ? [] : (await p.query(
        `SELECT 'ig:' || t.id AS id, COALESCE(t.name, t.username) AS name, t.username AS handle, 'instagram' AS channel, lm.body AS last_message, lm.direction AS last_from, lm.created_at AS last_at, t.last_inbound_at,
                (SELECT count(*)::int FROM ig_messages m WHERE m.thread_id=t.id AND m.direction='in' AND m.created_at > COALESCE(t.last_read_at, to_timestamp(0))) AS unread
           FROM ig_threads t JOIN LATERAL (SELECT body, direction, created_at FROM ig_messages m WHERE m.thread_id=t.id ORDER BY created_at DESC LIMIT 1) lm ON true
          WHERE t.ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) ORDER BY lm.created_at DESC LIMIT $2`, [wsId, n])).rows;
      return [...wa, ...ig].filter((r) => !unread || r.unread > 0).sort((a, b) => +new Date(b.last_at) - +new Date(a.last_at)).slice(0, n)
        .map((r) => ({ ...r, last_message: cut(r.last_message, 140), reply_window_open: !!r.last_inbound_at && Date.now() - +new Date(r.last_inbound_at) < 24 * 3600e3 }));
    }
    case "get_conversation": {
      const id = String(args.id ?? ""), n = lim(args.limit, 30, 60);
      if (id.startsWith("ig:")) {
        const t = (await p.query(`SELECT id, username, name, last_inbound_at FROM ig_threads WHERE id::text=$2 AND ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live)`, [wsId, id.slice(3)])).rows[0];
        if (!t) return { error: "not found" };
        const msgs = (await p.query(`SELECT direction, body, origin, created_at FROM ig_messages WHERE thread_id=$1 ORDER BY created_at DESC LIMIT $2`, [t.id, n])).rows.reverse();
        return { channel: "instagram", customer: t.username ? `@${t.username}` : t.name, reply_window_open: !!t.last_inbound_at && Date.now() - +new Date(t.last_inbound_at) < 24 * 3600e3, messages: msgs.map((m) => ({ from: m.direction === "in" ? "customer" : m.origin === "automation" ? "bot" : "business", text: cut(m.body, 600), at: m.created_at })) };
      }
      const c = (await p.query(`SELECT c.id, c.last_inbound_at, ct.name, ct.wa_id, ct.opt_in, ct.tags, ct.company, ct.location, ct.interested_in, ct.budget FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE c.id::text=$2 AND c.workspace_id=$1`, [wsId, id])).rows[0];
      if (!c) return { error: "not found" };
      const msgs = (await p.query(`SELECT direction, body, type, created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT $2`, [c.id, n])).rows.reverse();
      return { channel: "whatsapp", customer: { name: c.name, number: c.wa_id, opted_in: c.opt_in, tags: c.tags, company: c.company, location: c.location, interested_in: c.interested_in, budget: c.budget },
        reply_window_open: !!c.last_inbound_at && Date.now() - +new Date(c.last_inbound_at) < 24 * 3600e3,
        messages: msgs.map((m) => ({ from: m.direction === "in" ? "customer" : "business", text: cut(m.body ?? `[${m.type}]`, 600), at: m.created_at })) };
    }
    case "search_contacts": {
      const q = `%${String(args.q ?? "").trim()}%`;
      return (await p.query(`SELECT name, wa_id AS number, opt_in, tags, company, location, created_at FROM contacts WHERE workspace_id=$1 AND (name ILIKE $2 OR wa_id ILIKE $2 OR array_to_string(tags, ',') ILIKE $2) ORDER BY created_at DESC LIMIT $3`, [wsId, q, lim(args.limit, 10, 25)])).rows;
    }
    case "list_templates":
      return (await p.query(`SELECT name, category, language, status, rejection_reason, body FROM templates WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 40`, [wsId])).rows.map((t) => ({ ...t, body: cut(t.body, 240) }));
    case "list_keyword_rules":
      return (await p.query(`SELECT name, keywords, reply, enabled, on_whatsapp, on_instagram_dm, on_instagram_comment, fired_count FROM keyword_rules WHERE workspace_id=$1 ORDER BY created_at`, [wsId])).rows.map((r) => ({ ...r, reply: cut(r.reply, 200) }));
    case "list_instagram_comments": {
      const f = ["needs", "auto", "replied", "all"].includes(String(args.filter)) ? String(args.filter) : "needs";
      return (await listComments(wsId, { filter: f as "needs", limit: lim(args.limit, 15, 30) })).map((c) => ({ from: c.from_name, text: cut(c.text, 200), state: c.state, at: c.created_at }));
    }
    case "list_ad_campaigns": {
      const conn = await adsConnection(wsId);
      if (!conn) return { connected: false, note: "No ad account connected — campaigns are drafts/demo only." };
      const live = await liveCampaigns(conn);
      return live.ok ? { connected: true, account: conn.name, campaigns: live.campaigns.map((c) => ({ name: c.name, status: c.status, goal: c.objective, daily_budget_inr: c.daily_budget, spend_7d: c.insights.spend, results_7d: c.insights.results })) } : { error: live.error };
    }
    case "search_ad_locations": {
      const r = await findLocations(wsId, String(args.q ?? ""));
      return { ...(r.demo ? { note: "Planner mode (no ad account): demo places only — fine for a draft, the user must connect an ad account to publish." } : {}), locations: r.locations.slice(0, 8) };
    }
    case "search_ad_interests": {
      const conn = await adsConnection(wsId);
      if (!conn) return { error: "No ad account connected." };
      return (await searchInterests(conn, String(args.q ?? ""))).slice(0, 8).map((i) => ({ id: i.id, name: i.name, audience: i.audience_size_upper_bound }));
    }
  }
  return { error: `unknown tool ${name}` };
}

export function toProposal(name: string, args: Record<string, unknown>, n: number): Proposal | null {
  const summary = String(args.summary ?? "").slice(0, 160);
  const { summary: _s, ...payload } = args;
  const id = `p${Date.now().toString(36)}${n}`;
  if (name === "propose_campaign_form") return { id, type: "campaign_form", summary: summary || "Fill the campaign form", payload };
  if (name === "propose_reply") return { id, type: "reply", summary: summary || "Suggested reply", payload };
  if (name === "propose_keyword_rule") return { id, type: "keyword_rule", summary: summary || `Keyword rule “${args.name}”`, payload };
  if (name === "propose_template") return { id, type: "template", summary: summary || `Template ${args.name}`, payload };
  return null;
}

/** Server-side check of an AI campaign proposal: locations must be real (re-searched), the rest clamped. */
export async function sanitizeCampaignFields(wsId: string, f: Record<string, unknown>): Promise<{ fields: Record<string, unknown>; dropped: string[] }> {
  const out = { ...f };
  let dropped: string[] = [];
  if (Array.isArray(f.locations)) { const v = await verifyLocations(wsId, f.locations as { key?: string; name?: string }[]); out.locations = v.ok; dropped = v.dropped; }
  if (Array.isArray(f.interests)) out.interests = (f.interests as { id?: unknown; name?: unknown }[]).filter((i) => /^\d{6,}$/.test(String(i?.id ?? "")) && i?.name);
  if (f.dailyBudget !== undefined) out.dailyBudget = Math.max(100, Math.round(Number(f.dailyBudget) || 100));
  return { fields: out, dropped };
}
