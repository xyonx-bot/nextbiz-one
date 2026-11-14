import { afterEach, describe, expect, it, vi } from "vitest";

const inserts: unknown[][] = [];
const msgs: unknown[][] = [];
const sqls: string[] = [];
vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      sqls.push(sql);
      if (/FROM ig_accounts WHERE id/.test(sql)) return { rows: [{ id: "acct", workspace_id: "ws", ig_user_id: "OWNER", username: "mango.bakes", access_token: "tok", live: true, dms_synced_at: null }] };
      if (/INSERT INTO ig_threads/.test(sql)) return { rows: [{ id: "th1" }] };
      if (/INSERT INTO ig_messages/.test(sql)) { msgs.push(params); return { rows: [], rowCount: 1 }; }
      if (/INSERT INTO ig_comments/.test(sql)) { inserts.push(params); return { rows: [{ inserted: true }] }; }
      return { rows: [], rowCount: 0 };
    },
  }),
}));

import { syncIgComments, syncIgDms } from "@/lib/ig-sync";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); inserts.length = 0; msgs.length = 0; sqls.length = 0; });

describe("syncIgComments", () => {
  it("does nothing in mock mode (no Graph calls)", async () => {
    vi.stubEnv("IG_LIVE", "");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect((await syncIgComments("acct")).imported).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it("imports customer comments, skips our own, and records replies made in Instagram", async () => {
    vi.stubEnv("IG_LIVE", "true");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (url.includes("/me/media")) return json({ data: [{ id: "M1", comments_count: 4 }, { id: "M2", comments_count: 0 }] });
      if (url.includes("/M1/comments")) return json({ data: [
        { id: "c1", text: "price?", timestamp: "2026-11-14T10:00:00+0000", from: { id: "U1", username: "priya" },
          replies: { data: [{ id: "r1", text: "DM'd you!", timestamp: "2026-11-14T10:05:00+0000" }] } }, // nested replies come WITHOUT an author
        { id: "r1", text: "DM'd you!", timestamp: "2026-11-14T10:05:00+0000", username: "mango.bakes", from: { id: "OWNER", username: "mango.bakes" } }, // …and again top-level WITH it
        { id: "c2", text: "love it", timestamp: "2026-11-14T11:00:00+0000", username: "rahul", from: { id: "U2", username: "rahul" } },
        { id: "c3", text: "thanks all!", timestamp: "2026-11-14T12:00:00+0000", username: "mango.bakes", from: { id: "OWNER" } },
      ] });
      return new Response("{}", { status: 404 });
    }));
    const r = await syncIgComments("acct");
    expect(r).toMatchObject({ ok: true, posts: 1, imported: 2, answered: 1 });
    expect(inserts.map((p) => p[1])).toEqual(["c1", "c2"]); // c3 is ours — not a customer comment
    const c1 = inserts.find((p) => p[1] === "c1")!;
    expect(c1[8]).toBe("DM'd you!"); // owner_reply_text
    expect(inserts.find((p) => p[1] === "c2")![8]).toBeNull();
  });
});

describe("syncIgDms", () => {
  it("imports a conversation: customer messages in, ours out, new thread starts read, no automation", async () => {
    vi.stubEnv("IG_LIVE", "true");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (url.includes("/me/conversations")) return json({ data: [{ id: "CV1", updated_time: "2026-11-14T11:42:58+0000", participants: { data: [{ id: "OWNER", username: "mango.bakes" }, { id: "IGSID9", username: "mustafa" }] } }] });
      if (url.includes("/CV1?")) return json({ messages: { data: [ // newest first, like the API
        { id: "m3", created_time: "2026-11-14T11:42:56+0000", from: { id: "OWNER", username: "mango.bakes" }, attachments: { data: [{ image_data: {} }] } },
        { id: "m2", created_time: "2026-11-14T11:42:53+0000", from: { id: "IGSID9", username: "mustafa" }, message: "Send me the access" },
      ] } });
      return new Response("{}", { status: 404 });
    }));
    const r = await syncIgDms("acct");
    expect(r).toMatchObject({ ok: true, threads: 1, imported: 2 });
    expect(msgs.map((m) => [m[3], m[8], m[6]])).toEqual([["m2", "in", "Send me the access"], ["m3", "out", "[photo]"]]); // oldest first
    expect(sqls.some((q) => /SET last_read_at = now\(\)/.test(q))).toBe(true);
    expect(sqls.some((q) => /keyword_rules|automation_settings/.test(q))).toBe(false);
  });
});
