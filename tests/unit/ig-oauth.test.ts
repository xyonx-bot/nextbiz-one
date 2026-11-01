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
