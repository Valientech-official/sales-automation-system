import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/sales',
  trailingSlash: true,
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: undefined,
  },
};

export default nextConfig;
