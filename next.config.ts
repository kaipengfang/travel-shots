import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,  // 禁用图片优化，避免中文路径问题
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'loremflickr.com',
      },
      {
        protocol: 'https',
        hostname: 'photos.fangkaipeng.com',
      },
    ],
  },
};

export default nextConfig;
