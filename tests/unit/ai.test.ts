import { afterEach, describe, expect, it, vi } from "vitest";

let used = 0;
const logged: unknown[][] = [];
vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      if (/FROM platform_settings/.test(sql)) return { rows: [{ value: { dailyLimit: 3 } }] };
      if (/count\(\*\)::int AS n FROM ai_usage/.test(sql)) return { rows: [{ n: used }] };
      if (/INSERT INTO ai_usage/.test(sql)) { logged.push(params); return { rows: [] }; }
      return { rows: [] };
    },
  }),
}));

import { aiGate, complete, parseJson } from "@/lib/ai";
import { toProposal } from "@/lib/ai-tools";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); used = 0; logged.length = 0; });

describe("parseJson", () => {
  it("reads JSON wrapped in fences or chatter", () => {
    expect(parseJson<{ a: number }>("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
    expect(parseJson<{ a: number }>("Sure! {\"a\":2} hope that helps")).toEqual({ a: 2 });
    expect(parseJson("no json here")).toBeNull();
  });
});

describe("toProposal", () => {
  it("turns propose_* calls into approval cards and strips the summary from the payload", () => {
    const p = toProposal("propose_reply", { summary: "Reply to Priya", text: "Hi Priya!", conversation_id: "c1" }, 0)!;
    expect(p).toMatchObject({ type: "reply", summary: "Reply to Priya", payload: { text: "Hi Priya!", conversation_id: "c1" } });
    expect(p.payload).not.toHaveProperty("summary");
    expect(toProposal("propose_campaign_form", { dailyBudget: 500 }, 1)?.type).toBe("campaign_form");
    expect(toProposal("search_contacts", {}, 2)).toBeNull();
  });
});

describe("aiGate + complete", () => {
  it("blocks without a key, and once the workspace's daily limit is used", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(aiGate("ws")).rejects.toThrow(/isn't set up/);
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    used = 3;
    await expect(aiGate("ws")).rejects.toThrow(/limit \(3 requests\)/);
    used = 2;
    await expect(aiGate("ws")).resolves.toMatchObject({ dailyLimit: 3 });
  });
  it("logs cost per call and falls back when the main model fails", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const models: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const m = JSON.parse(String(init.body)).model as string; models.push(m);
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.0001 } }), { status: 200 });
    }));
    const r = await complete({ wsId: "ws", user: "u@x", feature: "suggest", model: "a/free", messages: [{ role: "user", content: "hey" }] });
    expect(r.message.content).toBe("hi");
    expect(logged[0]).toEqual(["ws", "u@x", "suggest", "a/free", 10, 2, 0.0001, true, null]);
    expect(models).toEqual(["a/free"]);
  });
});
