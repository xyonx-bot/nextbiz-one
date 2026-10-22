import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "../../lib/webhook";

describe("X-Hub-Signature-256 verification", () => {
  const secret = "test-app-secret";
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "123", changes: [{ value: { messages: [{ from: "919830012345", id: "wamid.1", timestamp: "1729600000", type: "text", text: { body: "hi" } }] } }] }],
  });

  it("accepts a correct sha256 signature", () => {
    const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("rejects a wrong secret's signature", () => {
    const sig = "sha256=" + createHmac("sha256", "other-secret").update(body).digest("hex");
    expect(verifySignature(body, sig, secret)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature(body + " ", "sha256=" + sig, secret)).toBe(false);
  });

  it("rejects missing / malformed headers", () => {
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifySignature(body, "sha256=zz", secret)).toBe(false);
  });
});
