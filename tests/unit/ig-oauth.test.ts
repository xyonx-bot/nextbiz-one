import { describe, expect, it, vi } from "vitest";
import { igOAuthDialogUrl, IG_SCOPES } from "@/lib/instagram";

describe("igOAuthDialogUrl (Instagram Business Login)", () => {
  it("builds the Meta dialog URL with client_id, encoded redirect_uri, scopes, state", () => {
    const u = igOAuthDialogUrl("https://one-beta.nextbizstudio.com/api/auth/instagram/callback", "st-123", "APPID");
    expect(u.startsWith("https://www.facebook.com/v21.0/dialog/oauth?")).toBe(true);
    const q = new URL(u).searchParams;
    expect(q.get("client_id")).toBe("APPID");
    expect(q.get("redirect_uri")).toBe("https://one-beta.nextbizstudio.com/api/auth/instagram/callback");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("state")).toBe("st-123");
    expect(q.get("scope")?.split(",")).toEqual([...IG_SCOPES]);
    expect(q.get("scope")).toContain("instagram_business_manage_messages");
    expect(q.get("config_id")).toBeNull(); // optional — only with unified login config
  });

  it("includes config_id when the unified Instagram login config is provided", () => {
    const u = igOAuthDialogUrl("https://one-beta.nextbizstudio.com/api/auth/instagram/callback", "st-9", "APPID", "1823777935713893");
    const q = new URL(u).searchParams;
    expect(q.get("config_id")).toBe("1823777935713893");
    // With a config, raw scope must NOT be sent — Meta rejects
    // "Invalid Scopes: instagram_business_*" otherwise. Permissions live in the config.
    expect(q.get("scope")).toBeNull();
    expect(q.get("override_default_response_type")).toBe("true");
    expect(q.get("response_type")).toBe("code");
  });
});

describe("exchangeIgCode guard", () => {
  it("mock mode (IG_LIVE unset) refuses to call Graph", async () => {
    vi.stubEnv("IG_LIVE", "");
    const { exchangeIgCode } = await import("@/lib/instagram");
    await expect(exchangeIgCode("fake-code", "https://x/cb")).rejects.toThrow(/mock mode/);
    vi.unstubAllEnvs();
  });
});

describe("resolveMetaCreds", () => {
  const REAL = "a1b2c3d4e5f60718293a4b5c6d7e8f90"; // 32 hex
  it("skips a junk IG_APP_SECRET placeholder and uses the real app secret", async () => {
    const { resolveMetaCreds } = await import("@/lib/instagram");
    const r = resolveMetaCreds({
      IG_APP_SECRET: "not-a-real-secret",
      WHATSAPP_APP_SECRET: REAL,
      IG_APP_ID: "1950786512230644",
      META_APP_ID: "1950786512230644",
    } as unknown as NodeJS.ProcessEnv);
    expect(r.appSecret).toBe(REAL);
    expect(r.appId).toBe("1950786512230644");
  });

  it("prefers a valid IG_APP_SECRET over the WhatsApp fallback", async () => {
    const { resolveMetaCreds } = await import("@/lib/instagram");
    const IG = "f0e1d2c3b4a5968778695a4b3c2d1e0f";
    const r = resolveMetaCreds({ IG_APP_SECRET: IG, WHATSAPP_APP_SECRET: REAL } as unknown as NodeJS.ProcessEnv);
    expect(r.appSecret).toBe(IG);
  });

  it("falls back to first candidate when none match the secret shape", async () => {
    const { resolveMetaCreds } = await import("@/lib/instagram");
    const r = resolveMetaCreds({ IG_APP_SECRET: "stub", WHATSAPP_APP_SECRET: "also-stub" } as unknown as NodeJS.ProcessEnv);
    expect(r.appSecret).toBe("stub");
  });
});

describe("resolveIgAccount (unified login)", () => {
  function jsonRes(body: unknown, ok = true) {
    return { ok, json: async () => body } as Response;
  }

  it("prefers the business portfolio's owned_instagram_accounts", async () => {
    vi.stubEnv("META_BUSINESS_ID", "2865391483826091");
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("owned_instagram_accounts")) {
        return jsonRes({ owned_instagram_accounts: { data: [{ id: "17841400000000001", username: "nextbiz" }] } });
      }
      return jsonRes({ data: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { resolveIgAccount } = await import("@/lib/instagram");
    await expect(resolveIgAccount("TOK")).resolves.toEqual({ id: "17841400000000001", username: "nextbiz" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("2865391483826091");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to /me/accounts instagram_business_account", async () => {
    vi.stubEnv("META_BUSINESS_ID", "");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/me/accounts")) {
        return jsonRes({ data: [
          { id: "p1", name: "NoPage" },
          { id: "p2", name: "PageX", instagram_business_account: { id: "17841400000000002" } },
        ] });
      }
      return jsonRes({});
    }));
    const { resolveIgAccount } = await import("@/lib/instagram");
    await expect(resolveIgAccount("TOK")).resolves.toEqual({ id: "17841400000000002", username: "PageX" });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns null id when nothing resolves", async () => {
    vi.stubEnv("META_BUSINESS_ID", "");
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ data: [] })));
    const { resolveIgAccount } = await import("@/lib/instagram");
    await expect(resolveIgAccount("TOK")).resolves.toEqual({ id: null });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
