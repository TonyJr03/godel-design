import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "110mb",
    serverActions: {
      bodySizeLimit: "110mb",
    },
  },
};

export default nextConfig;
