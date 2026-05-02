// Next.js Middleware — 認証・認可ガード。DB を引かず JWT payload の role だけで判定する。
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ------------------------------------------------------------------
  // /api/cron/:path* — Authorization ヘッダの存在だけ確認
  // (値の正当性は route 内で timingSafeEqual)
  // ------------------------------------------------------------------
  if (pathname.startsWith("/api/cron/")) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return unauthorizedJson("Authorization ヘッダが必要です。");
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
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/cron/:path*"],
};
