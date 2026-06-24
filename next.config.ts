import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  typescript: {
    // TypeScript 7 RC exposes the compiler through the new API; run tsc directly.
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default withEve(nextConfig);
