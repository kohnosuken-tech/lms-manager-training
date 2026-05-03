// Next.js Middleware — 認証・認可ガード。DB を引かず JWT payload の role だけで判定する。
// Edge Runtime で動くため node:crypto は使えない (Web Crypto + 自前 constant-time 実装)。
import { type NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "lms_session";

type SessionPayload = {
  userId: string;
  role: "STUDENT" | "ADMIN";
};

/**
 * SESSION_SECRET を Uint8Array に変換する。
 * middleware はモジュールスコープで実行されるため、
 * 関数呼び出しのたびに env を参照する形にする。
 */
function getSecret(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) return null;
  return new TextEncoder().encode(secret);
}

/**
 * Cookie の JWT を verify して payload を返す。
 * 検証失敗 / secret 未設定 / cookie なし → null
 */
async function verifySessionCookie(
  req: NextRequest,
): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const secret = getSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    if (payload.role !== "STUDENT" && payload.role !== "ADMIN") return null;
    return { userId: payload.userId, role: payload.role as "STUDENT" | "ADMIN" };
  } catch {
    return null;
  }
}

/** 401 JSON レスポンス (API 用) */
function unauthorizedJson(message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: "UNAUTHENTICATED", message } },
    { status: 401 },
  );
}

/** 403 JSON レスポンス (API 用) */
function forbiddenJson(message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: "FORBIDDEN", message } },
    { status: 403 },
  );
}

/**
 * H-3: タイミング攻撃を防ぐ文字列比較。
 * 長さが異なる場合も固定長バッファを使って比較することで
 * 処理時間の差異をなくす。
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  // 長さが異なれば偽だが、timing leak を避けるため最大長まで必ずループする。
  // Edge Runtime では node:crypto が使えないので Web Crypto 互換の自前実装を使う。
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const ac = i < a.length ? a.charCodeAt(i) : 0;
    const bc = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ------------------------------------------------------------------
  // C-1 対策: /uploads/:path* への直接アクセスを拒否する。
  // public/uploads/ は Next.js の静的配信で公開されてしまうため、
  // middleware でインターセプトして 404 を返す。
  // 動画はサーバー認可を経由する /api/lessons/[lessonId]/video 経由でのみ配信する。
  // ------------------------------------------------------------------
  if (pathname.startsWith("/uploads/")) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Not Found" } },
      { status: 404 },
    );
  }

  // ------------------------------------------------------------------
  // H-3: /api/cron/:path* — middleware で timing-safe 比較を実施
  // CRON_SECRET 未設定なら起動時警告 (ここでは 401 を返す)
  // ------------------------------------------------------------------
  if (pathname.startsWith("/api/cron/")) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      // H-3: secret 未設定時は 401 + 汎用メッセージ (情報漏洩を防ぐ)
      // ログは route handler 側でも出力するが、middleware で先行して遮断する
      return unauthorizedJson("Unauthorized");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    // H-3: timing-safe 比較で brute force / timing 攻撃を防ぐ
    if (!timingSafeStringEqual(token, cronSecret)) {
      return unauthorizedJson("Unauthorized");
    }

    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // /api/admin/:path* — 未認証 / STUDENT → 401
  // ------------------------------------------------------------------
  if (pathname.startsWith("/api/admin/")) {
    const session = await verifySessionCookie(req);
    if (!session) {
      return unauthorizedJson("認証が必要です。");
    }
    if (session.role !== "ADMIN") {
      return forbiddenJson("管理者権限が必要です。");
    }
    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // /admin/:path* — 未認証 → /sign-in, STUDENT → /forbidden
  // ------------------------------------------------------------------
  if (pathname.startsWith("/admin")) {
    const session = await verifySessionCookie(req);
    if (!session) {
      const signIn = req.nextUrl.clone();
      signIn.pathname = "/sign-in";
      return NextResponse.redirect(signIn);
    }
    if (session.role !== "ADMIN") {
      const forbidden = req.nextUrl.clone();
      forbidden.pathname = "/forbidden";
      return NextResponse.redirect(forbidden);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/cron/:path*",
    "/uploads/:path*",
  ],
};
