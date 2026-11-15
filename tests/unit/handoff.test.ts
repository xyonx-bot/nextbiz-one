import { beforeEach, describe, expect, it, vi } from "vitest";
import { HANDOFF_HOURS, handoffActive, handoffEndsAt, isCommand } from "../../lib/handoff";

describe("handoff timing", () => {
  const now = Date.parse("2026-11-15T18:00:00Z");
  it("is active within HANDOFF_HOURS of the manual reply", () => {
    expect(handoffActive(true, new Date(now - 60_000), now)).toBe(true);
    expect(handoffActive(true, new Date(now - (HANDOFF_HOURS * 3600_000 - 1000)), now)).toBe(true);
  });
  it("expires after HANDOFF_HOURS", () => {
    expect(handoffActive(true, new Date(now - HANDOFF_HOURS * 3600_000 - 1), now)).toBe(false);
  });
  it("legacy pause without a timestamp counts as expired", () => {
    expect(handoffActive(true, null, now)).toBe(false);
    expect(handoffEndsAt(true, null)).toBeNull();
  });
  it("not paused = not active", () => {
    expect(handoffActive(false, new Date(now), now)).toBe(false);
  });
  it("commands are exact START/STOP-style words", () => {
    for (const t of ["START", "start", " Start ", "STOP", "unsubscribe", "subscribe"]) expect(isCommand(t), t).toBe(true);
    for (const t of ["start my project", "hi", "restart", "please stop"]) expect(isCommand(t), t).toBe(false);
  });
});

// ── engine: mocked DB + WhatsApp sender ──────────────────────────
const sent: string[] = [];
const updates: string[] = [];
let conv: Record<string, unknown> = {};
let settings: Record<string, unknown> = {};
const rules = [{ id: "r1", name: "start", keywords: ["start"], reply: "Welcome! You're in.", send_once: false }];

vi.mock("../../lib/db", () => ({
  getPool: () => ({
    query: async (sql: string) => {
      if (/FROM conversations WHERE id/.test(sql)) return { rows: [conv] };
      if (/FROM automation_settings/.test(sql)) return { rows: [settings] };
      if (/FROM keyword_rules/.test(sql)) return { rows: rules };
      if (/^\s*UPDATE conversations/.test(sql)) updates.push(sql.replace(/\s+/g, " ").trim());
      return { rows: [], rowCount: 1 };
    },
  }),
}));
vi.mock("../../lib/wa-client", () => ({
  getWaCreds: async () => ({}),
  sendText: async (_c: unknown, _to: string, body: string) => { sent.push(body); return { ok: true, waMessageId: "w" + sent.length }; },
}));

describe("maybeAutoReply with a human handoff", async () => {
  const { maybeAutoReply } = await import("../../lib/automation");
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
  beforeEach(() => {
    sent.length = 0; updates.length = 0;
    settings = { welcome_enabled: true, welcome_text: "Hi! Thanks for reaching out.", away_enabled: false, business_hours: null };
  });

  it("START is answered during an active handoff — keyword reply only, no welcome", async () => {
    conv = { automation_paused: true, automation_paused_at: hoursAgo(1), welcome_sent_at: null };
    await maybeAutoReply("ws", "ct", "cv", "91", "START");
    expect(sent).toEqual(["Welcome! You're in."]);
  });

  it("ordinary messages stay quiet during an active handoff", async () => {
    conv = { automation_paused: true, automation_paused_at: hoursAgo(1), welcome_sent_at: null };
    await maybeAutoReply("ws", "ct", "cv", "91", "hello, start my project please");
    expect(sent).toEqual([]);
  });

  it("legacy pause (no timestamp) resumes: flag cleared and rules fire", async () => {
    conv = { automation_paused: true, automation_paused_at: null, welcome_sent_at: new Date() };
    await maybeAutoReply("ws", "ct", "cv", "91", "can we start?");
    expect(updates.some((u) => /automation_paused = false/.test(u))).toBe(true);
    expect(sent).toEqual(["Welcome! You're in."]);
  });

  it("expired handoff resumes after HANDOFF_HOURS", async () => {
    conv = { automation_paused: true, automation_paused_at: hoursAgo(HANDOFF_HOURS + 1), welcome_sent_at: new Date() };
    await maybeAutoReply("ws", "ct", "cv", "91", "start");
    expect(sent).toEqual(["Welcome! You're in."]);
  });

  it("START bypasses the away message too", async () => {
    settings = { ...settings, away_enabled: true, away_text: "We're closed", business_hours: { mon: ["00:00", "00:01"], tue: ["00:00", "00:01"], wed: ["00:00", "00:01"], thu: ["00:00", "00:01"], fri: ["00:00", "00:01"], sat: ["00:00", "00:01"], sun: ["00:00", "00:01"] } };
    conv = { automation_paused: false, automation_paused_at: null, welcome_sent_at: null };
    await maybeAutoReply("ws", "ct", "cv", "91", "START");
    expect(sent).toEqual(["Welcome! You're in."]);
  });

  it("a brand-new chat that says hi still gets the welcome (unchanged)", async () => {
    conv = { automation_paused: false, automation_paused_at: null, welcome_sent_at: null };
    await maybeAutoReply("ws", "ct", "cv", "91", "hi");
    expect(sent).toEqual(["Hi! Thanks for reaching out."]);
  });
});
