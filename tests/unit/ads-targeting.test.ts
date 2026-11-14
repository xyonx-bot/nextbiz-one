import { describe, expect, it } from "vitest";
import { targetingOf } from "@/lib/meta-ads-create";
import { Spec } from "@/lib/ads-spec";

const base = { goal: "whatsapp" as const, ageMin: 21, ageMax: 55, genders: "all" as const, interests: [], advantageAudience: false, placements: "auto" as const };

describe("targetingOf", () => {
  it("turns picked places into Meta geo targeting (city radius clamped to 10–80 km)", () => {
    const t = targetingOf({ ...base, locations: [
      { key: "IN", type: "country", name: "India" }, { key: "1746", type: "region", name: "West Bengal" },
      { key: "1020734", type: "city", name: "Kolkata", radiusKm: 120 }, { key: "IN:700001", type: "zip", name: "700001" }] });
    expect(t.geo_locations).toEqual({ countries: ["IN"], regions: [{ key: "1746" }], cities: [{ key: "1020734", radius: 80, distance_unit: "kilometer" }], zips: [{ key: "IN:700001" }], location_types: ["home", "recent"] });
    expect(t).toMatchObject({ age_min: 21, age_max: 55, targeting_automation: { advantage_audience: 0 } });
    expect(t.publisher_platforms).toBeUndefined(); // Advantage+ placements = Meta decides
  });
  it("manual placements, gender and interests", () => {
    const t = targetingOf({ ...base, genders: "women", interests: [{ id: "6003", name: "Baking" }], locations: [{ key: "1020734", type: "city", name: "Kolkata" }],
      placements: ["instagram:stream", "instagram:story", "messenger:messenger_home"] });
    expect(t.genders).toEqual([2]);
    expect(t.flexible_spec).toEqual([{ interests: [{ id: "6003", name: "Baking" }] }]);
    expect(t.instagram_positions).toEqual(["stream", "story"]);
    expect(t.messenger_positions).toEqual(["messenger_home"]);
    expect(t.facebook_positions).toEqual(["feed"]); // Messenger needs Facebook feed alongside
    expect(new Set(t.publisher_platforms as string[])).toEqual(new Set(["instagram", "messenger", "facebook"]));
  });
});

describe("Spec validation", () => {
  const ok = { ...base, name: "Diwali", pageId: "1509777878866990", instagramId: null, format: "image", imageHash: "abc", primaryText: "Hi", headline: "Cakes",
    dailyBudget: 500, locations: [{ key: "1020734", type: "city", name: "Kolkata", radiusKm: 25 }] };
  it("accepts a complete ad", () => { expect(Spec.safeParse(ok).success).toBe(true); });
  it("rejects no location, tiny budget, upside-down ages", () => {
    expect(Spec.safeParse({ ...ok, locations: [] }).success).toBe(false);
    expect(Spec.safeParse({ ...ok, dailyBudget: 50 }).success).toBe(false);
    expect(Spec.safeParse({ ...ok, ageMin: 40, ageMax: 30 }).success).toBe(false);
  });
});
