import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercelでは basePathは不要
  // basePath: '/sales',
  trailingSlash: true,
};

export default nextConfig;
