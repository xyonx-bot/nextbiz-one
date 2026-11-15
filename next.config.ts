import { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // the repo sits beside sibling repos (NBS, joyverse-mcp) — pin the tracing
  // root so the build never confuses their lockfiles for ours
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      // illustrations are fingerprint-free but rarely change: cache a day, revalidate after
      { source: "/art/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
};

export default nextConfig;
