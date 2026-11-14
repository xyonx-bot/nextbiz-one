import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }) }));

import { liveCampaigns, setLiveStatus, type AdsConnection } from "@/lib/meta-ads";

const conn = (): AdsConnection => ({ id: "c1", workspace_id: "ws", ad_account_id: "act_111222333", name: "Shop Ads", currency: "INR", timezone: "Asia/Kolkata",
  uses_system_token: true, token_enc: null, token_expires_at: null, last_error: null, updated_at: "" });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

describe("liveCampaigns", () => {
  it("maps Meta campaigns: paise → rupees, effective status, WhatsApp chats as results", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "sys-token");
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [
      { id: "120001", name: "Diwali CTWA", objective: "OUTCOME_ENGAGEMENT", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "50000",
        insights: { data: [{ spend: "1234.567", impressions: "10000", reach: "8000", clicks: "300", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "41" }, { action_type: "link_click", value: "300" }] }] } },
      { id: "120002", name: "Old traffic", objective: "LINK_CLICKS", effective_status: "CAMPAIGN_PAUSED", daily_budget: "20000" },
      { id: "120003", name: "Review", objective: "OUTCOME_LEADS", effective_status: "PENDING_REVIEW" },
    ] })));
    const r = await liveCampaigns(conn());
    if (!r.ok) throw new Error(r.error);
    const [a, b, c] = r.campaigns;
    expect(a).toMatchObject({ id: "120001", status: "ACTIVE", daily_budget: 500, destination: "whatsapp", source: "live" });
    expect(a.insights).toMatchObject({ spend: 1234.57, results: 41, cost_per_result: 30.11 });
    expect(b).toMatchObject({ objective: "OUTCOME_TRAFFIC", status: "PAUSED", daily_budget: 200 });
    expect(c.status).toBe("IN_REVIEW");
  });

  it("explains an expired login instead of calling Meta", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await liveCampaigns(conn());
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("setLiveStatus", () => {
  it("refuses a campaign that belongs to another ad account", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "sys-token");
    const f = vi.fn(async () => json({ account_id: "999999999", id: "120009" }));
    vi.stubGlobal("fetch", f);
    const r = await setLiveStatus(conn(), "120009", "ACTIVE");
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1); // only the ownership read — no POST
  });
  it("pauses a campaign of the connected account", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "sys-token");
    const calls: { url: string; method?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return url.includes("fields=account_id") ? json({ account_id: "111222333" }) : json({ success: true });
    }));
    const r = await setLiveStatus(conn(), "120001", "PAUSED");
    expect(r.ok).toBe(true);
    expect(calls[1]).toMatchObject({ method: "POST" });
  });
});
