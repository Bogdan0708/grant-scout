import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Next 16.3's CLI path cannot parse its captured `tsc --showConfig` output
    // in this WSL workspace. Keep type checking enabled through the compiler API.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
