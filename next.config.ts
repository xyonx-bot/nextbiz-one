import { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // the repo sits beside sibling repos (NBS, joyverse-mcp) — pin the tracing
  // root so the build never confuses their lockfiles for ours
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
