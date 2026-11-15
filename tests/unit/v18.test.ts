import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: async () => ({ rows: [] }) }) }));
import { normalizePhone, cleanTags } from "@/lib/contacts";
import { templateComponents } from "@/lib/wa-client";
import { storySpecOf, welcomeSpec } from "@/lib/meta-ads-create";

describe("normalizePhone", () => {
  it("adds the default country code only when there isn't one", () => {
    expect(normalizePhone("98765 43210")).toBe("919876543210");
    expect(normalizePhone("098765-43210")).toBe("919876543210");
    expect(normalizePhone("+1 (415) 555-0100")).toBe("14155550100");
    expect(normalizePhone("0044 7700 900123")).toBe("447700900123");
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
  it("cleans tags", () => { expect(cleanTags("Lead; VIP, lead")).toEqual(["lead", "vip"]); });
});

describe("templateComponents", () => {
  it("builds header, body with samples, footer and buttons in Meta's shape", () => {
    const c = templateComponents({ name: "x", language: "en", category: "MARKETING", bodyText: "Hi {{1}}, ok", samples: ["Rahul"],
      header: { format: "IMAGE", handle: "4::abc" }, footer: "Bye", buttons: [{ type: "QUICK_REPLY", text: "Yes" }, { type: "URL", text: "Shop", url: "https://a.in" }] });
    expect(c[0]).toEqual({ type: "HEADER", format: "IMAGE", example: { header_handle: ["4::abc"] } });
    expect(c[1]).toEqual({ type: "BODY", text: "Hi {{1}}, ok", example: { body_text: ["Rahul"] } });
    expect(c[2]).toEqual({ type: "FOOTER", text: "Bye" });
    expect(c[3]).toEqual({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Yes" }, { type: "URL", text: "Shop", url: "https://a.in" }] });
  });
  it("skips a media header without a sample handle", () => {
    expect(templateComponents({ name: "x", language: "en", category: "UTILITY", bodyText: "Static text", header: { format: "VIDEO" } }).map((x) => x.type)).toEqual(["BODY"]);
  });
});

describe("ad creative", () => {
  const base = { pageId: "1", instagramId: null, format: "image" as const, imageHash: "h", primaryText: "p", headline: "h", websiteUrl: null };
  it("WhatsApp: custom button keeps the WhatsApp destination; greeting + quick questions", () => {
    const s = storySpecOf({ ...base, goal: "whatsapp", cta: "SHOP_NOW", welcome: { greeting: "Hi!", mode: "questions", questions: ["Price?", " "], extra: "call" } });
    const ld = s.link_data as Record<string, any>;
    expect(ld.call_to_action).toEqual({ type: "SHOP_NOW", value: { app_destination: "WHATSAPP" } });
    expect(ld.page_welcome_message.text_format).toEqual({ customer_action_type: "ice_breakers", message: { text: "Hi!", automated_greeting_message_cta: { type: "call" }, ice_breakers: [{ title: "Price?" }] } });
  });
  it("defaults to Meta's chat button and no greeting when empty", () => {
    const s = storySpecOf({ ...base, goal: "instagram_dm", cta: null, welcome: { greeting: " ", mode: "autofill" } });
    expect((s.link_data as Record<string, any>).call_to_action.type).toBe("INSTAGRAM_MESSAGE");
    expect((s.link_data as Record<string, any>).page_welcome_message).toBeUndefined();
    expect(welcomeSpec({ greeting: "Hey", mode: "autofill", autofill: "I want one" }, "instagram_dm")).toMatchObject({ text_format: { customer_action_type: "autofill_message", message: { autofill_message: { content: "I want one" } } } });
  });
});

describe("mail safety", () => {
  it("never emails reserved test domains", async () => {
    const { isTestAddress } = await import("@/lib/mail");
    for (const a of ["x@nbo.test", "launch-1@e2e.test", "a@example.com", "b@foo.invalid", "c@localhost"]) expect(isTestAddress(a)).toBe(true);
    for (const a of ["owner@nextbizstudio.com", "someone@gmail.com", "me@test.com"]) expect(isTestAddress(a)).toBe(false);
  });
});
