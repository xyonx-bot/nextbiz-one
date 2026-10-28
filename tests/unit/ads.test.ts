import { describe, expect, it } from "vitest";
import { filterCampaigns, performance, seedCampaigns } from "@/lib/ads";

const WS = "00000000-0000-0000-0000-0000000000ad";

describe("ads mock data layer", () => {
  it("seedCampaigns is deterministic per workspace (no flicker between renders)", () => {
    const a = seedCampaigns(WS);
    const b = seedCampaigns(WS);
    expect(a.map((c) => [c.id, c.name, c.insights.spend, c.insights.results]))
      .toEqual(b.map((c) => [c.id, c.name, c.insights.spend, c.insights.results]));
  });

  it("seven fixtures with coherent INR numbers", () => {
    const cs = seedCampaigns(WS);
    expect(cs.length).toBe(7);
    for (const c of cs) {
      expect(c.source).toBe("demo");
      expect(c.daily_budget).toBeGreaterThanOrEqual(300);
      if (c.status === "ACTIVE" || c.status === "PAUSED") {
        expect(c.insights.spend).toBeGreaterThan(0);
        expect(c.insights.impressions).toBeGreaterThanOrEqual(c.insights.reach);
        expect(c.insights.results).toBeGreaterThan(0);
        const cpr = Math.round((c.insights.spend / c.insights.results) * 100) / 100;
        expect(c.insights.cost_per_result).toBe(cpr);
      } else {
        expect(c.insights.spend).toBe(0); // DRAFT / IN_REVIEW never accrue
      }
    }
  });

  it("filterCampaigns searches names and filters by status", () => {
    const cs = seedCampaigns(WS);
    const festive = filterCampaigns(cs, "festive", null);
    expect(festive.length).toBe(1);
    expect(festive[0].name.toLowerCase()).toContain("festive");
    const active = filterCampaigns(cs, "", "ACTIVE");
    expect(active.every((c) => c.status === "ACTIVE")).toBe(true);
    expect(active.length).toBeGreaterThan(0);
    const both = filterCampaigns(cs, "whatsapp", null); // objective label match
    expect(both.length).toBeGreaterThan(0);
  });

  it("performance builds a normalized series that preserves totals", () => {
    const cs = seedCampaigns(WS);
    for (const days of [7, 30] as const) {
      const r = performance(cs, days, WS);
      expect(r.series.length).toBe(days);
      expect(r.currency).toBe("INR");
      expect(r.demo).toBe(true);
      const sum = r.series.reduce((a, p) => a + p.spend, 0);
      expect(Math.abs(sum - r.totals.spend)).toBeLessThan(1); // rounding only
      expect(r.totals.spend).toBeGreaterThan(0);
      expect(r.totals.cost_per_result).toBeGreaterThan(0);
      // dates are YYYY-MM-DD and unique
      expect(new Set(r.series.map((p) => p.date)).size).toBe(days);
    }
  });
});
