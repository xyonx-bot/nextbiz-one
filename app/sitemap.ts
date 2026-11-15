import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.PUBLIC_URL ?? "https://one.nextbizstudio.com";
  return ["/login", "/request-access", "/privacy", "/terms", "/data-deletion"].map((p) => ({ url: base + p, changeFrequency: "monthly", priority: p === "/login" ? 1 : 0.5 }));
}
