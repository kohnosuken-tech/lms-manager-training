import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const cspDirectives = [
  "default-src 'self'",
  // dev では React の開発支援機能が eval を必要とする
  `script-src 'self' 'unsafe-inline' ${isProd ? "" : "'unsafe-eval' "}https://www.youtube.com https://www.youtube-nocookie.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://i.ytimg.com",
  "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  "connect-src 'self' https://www.youtube.com",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // HSTS は本番のみ付与 (localhost で HTTPS 強制すると開発が壊れる)
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // X-Powered-By: Next.js ヘッダを削除 (情報漏洩対策)
  poweredByHeader: false,

  async headers() {
    return [
      {
        // 全パスに適用
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
