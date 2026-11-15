import type { MetadataRoute } from "next";

/** Public pages may be indexed; the app itself never. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.PUBLIC_URL ?? "https://one.nextbizstudio.com";
  return { rules: [{ userAgent: "*", allow: ["/login", "/request-access", "/privacy", "/terms", "/data-deletion"], disallow: "/" }], sitemap: `${base}/sitemap.xml` };
}
