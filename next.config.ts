import type { NextConfig } from "next";

/**
 * M-1: CSP の script-src は middleware で nonce を使って動的に付与する。
 * next.config.ts の静的ヘッダから Content-Security-Policy を削除し、
 * 'unsafe-inline' が漏れないようにする。
 * その他のセキュリティヘッダは引き続き静的に付与する。
 */

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
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
