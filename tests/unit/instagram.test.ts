import { describe, expect, it, vi } from "vitest";
import { parseIgEvents, igLive } from "@/lib/instagram";

const DM_PAYLOAD = {
  object: "instagram",
  entry: [{
    id: "ig-user-100",
    time: 1730000000,
    messaging: [{
      sender: { id: "fan-1", username: "fan_one" },
      recipient: { id: "ig-user-100" },
      timestamp: "1730000000",
      message: { mid: "mid-abc-1", text: "hi from ig" },
    }],
  }],
};

const COMMENT_PAYLOAD = {
  object: "instagram",
  entry: [{
    id: "ig-user-100",
    changes: [{
      field: "comments",
      value: {
        comment_id: "c-777",
        from: { id: "fan-2", username: "fan_two" },
        media_id: "media-9",
        text: "nice reel!",
      },
    }],
  }],
};

describe("parseIgEvents", () => {
  it("parses a DM entry: mid, sender, body, dedupe key", () => {
    const [e] = parseIgEvents(DM_PAYLOAD);
    expect(e.igUserId).toBe("ig-user-100");
    expect(e.eventId).toBe("ig-user-100:mid-abc-1");
    expect(e.messages).toHaveLength(1);
    expect(e.messages[0]).toMatchObject({ mid: "mid-abc-1", senderId: "fan-1", senderName: "fan_one", body: "hi from ig" });
  });

  it("parses a comment change: comment_id, from, media, text", () => {
    const [e] = parseIgEvents(COMMENT_PAYLOAD);
    expect(e.eventId).toBe("ig-user-100:c-777");
    expect(e.comments).toHaveLength(1);
    expect(e.comments[0]).toMatchObject({ commentId: "c-777", fromId: "fan-2", fromName: "fan_two", mediaId: "media-9", text: "nice reel!" });
  });

  it("dedupe key is stable across retries (same payload -> same eventId)", () => {
    expect(parseIgEvents(DM_PAYLOAD)[0].eventId).toBe(parseIgEvents(JSON.parse(JSON.stringify(DM_PAYLOAD)))[0].eventId);
  });

  it("garbage in -> empty out (never throws)", () => {
    expect(parseIgEvents(null)).toEqual([]);
    expect(parseIgEvents("x")).toEqual([]);
    expect(parseIgEvents({})).toEqual([]);
    expect(parseIgEvents({ entry: [{ messaging: [{ message: {} }] }] })).toEqual([
      expect.objectContaining({ messages: [], comments: [] }),
    ]);
  });
});

describe("igLive guard", () => {
  it("defaults to false (mock) unless IG_LIVE=true", () => {
    vi.stubEnv("IG_LIVE", "");
    expect(igLive()).toBe(false);
    vi.stubEnv("IG_LIVE", "true");
    expect(igLive()).toBe(true);
    vi.unstubAllEnvs();
  });
});
