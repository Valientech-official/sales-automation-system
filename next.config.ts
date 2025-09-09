import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercelでは basePathは不要
  // basePath: '/sales',
  trailingSlash: true,
  eslint: {
    // ビルド時のESLintチェックを無効化
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ビルド時のTypeScriptエラーを警告に変更
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
