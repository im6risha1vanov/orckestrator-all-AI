import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingIncludes: {
    "/": ["./node_modules/@swc/helpers/**/*"],
  },
  outputFileTracingExcludes: {
    "*": [".git/**", "packaging/**", "data/**"],
  },
};

export default nextConfig;
