import { afterEach, describe, expect, it, vi } from "vitest";
import { ownSends } from "../../lib/instagram";

afterEach(() => vi.useRealTimers());

describe("ownSends (echoes of our own Instagram sends)", () => {
  it("recognises a text we just sent on that account, for two minutes", () => {
    vi.useFakeTimers();
    ownSends.add("acct-1", "Hi! Our price list…");
    expect(ownSends.has("acct-1", "Hi! Our price list…")).toBe(true);
    expect(ownSends.has("acct-2", "Hi! Our price list…")).toBe(false);
    expect(ownSends.has("acct-1", "typed by a person")).toBe(false);
    expect(ownSends.has("acct-1", null)).toBe(false);
    vi.advanceTimersByTime(121_000);
    expect(ownSends.has("acct-1", "Hi! Our price list…")).toBe(false);
  });
});
