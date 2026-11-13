import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const queries: { sql: string; params: unknown[] }[] = [];
vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/INSERT INTO workspaces/.test(sql)) return { rows: [{ id: "ws-1" }], rowCount: 1 };
      if (/INSERT INTO ig_accounts/.test(sql)) return { rows: [{ id: "acct-1", ig_user_id: params[1], username: params[3], live: true, scopes: [], expires_at: params[8], updated_at: "now" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  }),
}));

import { igOAuthDialogUrl, IG_SCOPES, parseIgEvents, verifyIgSignature } from "@/lib/instagram";
import { matchRule } from "@/lib/ig-automation";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); queries.length = 0; });

describe("igOAuthDialogUrl (Instagram Login)", () => {
  it("builds the instagram.com authorize URL with client_id, redirect_uri, scopes, state", () => {
    const url = new URL(igOAuthDialogUrl("https://one.example.com/api/auth/instagram/callback", "st8", "1234567890"));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    const q = url.searchParams;
    expect(q.get("client_id")).toBe("1234567890");
    expect(q.get("redirect_uri")).toBe("https://one.example.com/api/auth/instagram/callback");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")?.split(",")).toEqual([...IG_SCOPES]);
    expect(q.get("state")).toBe("st8");
    expect(q.get("config_id")).toBeNull();
  });
});

describe("exchangeIgCode", () => {
  it("mock mode (IG_LIVE unset) refuses to call Graph", async () => {
    vi.stubEnv("IG_LIVE", "");
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const { exchangeIgCode } = await import("@/lib/instagram");
    await expect(exchangeIgCode("code", "https://x/cb")).rejects.toThrow(/mock mode/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("live: short token → long-lived → /me user_id → stores account → subscribes webhooks", async () => {
    vi.stubEnv("IG_LIVE", "true"); vi.stubEnv("IG_APP_ID", "1234567890"); vi.stubEnv("IG_APP_SECRET", "a".repeat(32));
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (url.startsWith("https://api.instagram.com/oauth/access_token")) return json({ access_token: "short", user_id: 99, permissions: [...IG_SCOPES] });
      if (url.includes("grant_type=ig_exchange_token")) return json({ access_token: "long", expires_in: 5184000 });
      if (url.includes("/me?fields=user_id")) return json({ user_id: "17841400000000001", username: "testshop", name: "Test Shop" });
      if (url.includes("/me/subscribed_apps")) return json({ success: true });
      return new Response("{}", { status: 404 });
    }));
    const { exchangeIgCode } = await import("@/lib/instagram");
    const r = await exchangeIgCode("abc#_", "https://x/cb");
    expect(r.mock).toBe(false);
    expect(r.account.webhook_subscribed).toBe(true);
    expect(calls[0]).toBe("https://api.instagram.com/oauth/access_token");
    expect(calls.some((c) => c.includes("subscribed_fields=messages,comments"))).toBe(true);
    const ins = queries.find((q) => /INSERT INTO ig_accounts/.test(q.sql))!;
    expect(ins.params[1]).toBe("17841400000000001"); // webhook entry.id = IG professional account id
    expect(ins.params[6]).toBe("long");
  });
});

describe("parseIgEvents", () => {
  it("marks echoes (messages the business sent) and keeps the customer as recipient", () => {
    const [e] = parseIgEvents({ entry: [{ id: "IG1", time: 1, messaging: [{ sender: { id: "IG1" }, recipient: { id: "CUST" }, message: { mid: "m1", text: "hi there", is_echo: true } }] }] });
    expect(e.messages[0]).toMatchObject({ isEcho: true, senderId: "IG1", recipientId: "CUST", body: "hi there" });
  });
  it("reads comment media + parent ids", () => {
    const [e] = parseIgEvents({ entry: [{ id: "IG1", changes: [{ field: "comments", value: { id: "c1", text: "price?", from: { id: "U1", username: "fan" }, media: { id: "M1" }, parent_id: "c0" } }] }] });
    expect(e.comments[0]).toMatchObject({ commentId: "c1", fromId: "U1", mediaId: "M1", parentId: "c0", text: "price?" });
  });
  it("skips reads/reactions/deleted messages", () => {
    const [e] = parseIgEvents({ entry: [{ id: "IG1", messaging: [{ sender: { id: "U" }, read: { mid: "x" } }, { sender: { id: "U" }, message: { mid: "d", is_deleted: true } }] }] });
    expect(e.messages).toHaveLength(0);
  });
});

describe("verifyIgSignature", () => {
  it("accepts a payload signed with either the Instagram or the Meta app secret", () => {
    vi.stubEnv("IG_APP_SECRET", "igsecret"); vi.stubEnv("META_APP_SECRET", "metasecret"); vi.stubEnv("WHATSAPP_APP_SECRET", "");
    const body = '{"a":1}';
    const sig = (k: string) => "sha256=" + createHmac("sha256", k).update(body).digest("hex");
    expect(verifyIgSignature(body, sig("igsecret"))).toBe(true);
    expect(verifyIgSignature(body, sig("metasecret"))).toBe(true);
    expect(verifyIgSignature(body, sig("wrong"))).toBe(false);
  });
});

describe("matchRule", () => {
  it("first rule whose keyword appears (case-insensitive) wins", () => {
    const rules = [{ id: "1", keywords: ["price", "cost"] }, { id: "2", keywords: ["PRICE list"] }];
    expect(matchRule(rules, "What's the Price?")?.id).toBe("1");
    expect(matchRule(rules, "hello")).toBeNull();
  });
});
