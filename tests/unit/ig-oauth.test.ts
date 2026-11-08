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
