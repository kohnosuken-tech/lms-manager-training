import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type {
  AuthPort,
  SessionUser,
  SignInInput,
  SignInResult,
} from "@/server/ports/auth";
import { prisma } from "@/server/repositories/db";
import { stubAudit } from "./audit";
import { stubLogger } from "./logger";

const COOKIE_NAME = "lms_session";
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

// ------------------------------------------------------------------
// L-3: 本番環境でデフォルト (dev) シークレットが使われていたら即 throw する。
// アプリ起動時にモジュールがロードされた段階で検出する。
// ------------------------------------------------------------------
const DEV_SESSION_SECRET = "dev-secret-change-me-32chars-long-please";
if (
  process.env.NODE_ENV === "production" &&
  process.env.SESSION_SECRET === DEV_SESSION_SECRET
) {
  throw new Error(
    "[SECURITY] SESSION_SECRET に開発用デフォルト値が使われています。" +
      "本番環境では必ず強力なランダム値に変更してください。",
  );
}

// Mock-first: 任意の非空パスワードを許容する。seed ユーザーが存在すればログイン成功。
// 本番では Clerk アダプタに差し替わるため、ここでの緩さは本番に影響しない。

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short (need >= 16 chars)",
    );
  }
  return new TextEncoder().encode(secret);
}

// H-2: sessionVersion を payload に追加
type SessionPayload = {
  userId: string;
  role: "STUDENT" | "ADMIN";
  sessionVersion: number;
};

async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(getSecret());
}

/**
 * H-2: JWT を検証したうえで DB の sessionVersion と突き合わせる。
 * - JWT の sessionVersion が DB と一致しない場合は null を返す (revoke 済み扱い)
 */
async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.sessionVersion !== "number"
    ) {
      return null;
    }
    if (payload.role !== "STUDENT" && payload.role !== "ADMIN") return null;

    // H-2: DB の sessionVersion と比較して不一致なら無効
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { sessionVersion: true },
    });
    if (!user) return null;
    if (user.sessionVersion !== payload.sessionVersion) {
      stubLogger.warn("auth.session_version_mismatch", {
        userId: payload.userId,
        jwtVersion: payload.sessionVersion,
        dbVersion: user.sessionVersion,
      });
      return null;
    }

    return {
      userId: payload.userId,
      role: payload.role,
      sessionVersion: payload.sessionVersion,
    };
  } catch {
    return null;
  }
}

function toSessionUser(u: {
  id: string;
  email: string;
  name: string;
  role: "STUDENT" | "ADMIN";
  deactivated: boolean;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    deactivated: u.deactivated,
  };
}

export const stubAuth: AuthPort = {
  async signIn({ email, password }: SignInInput): Promise<SignInResult> {
    const normalizedEmail = email.trim().toLowerCase();
    if (password.trim().length === 0) {
      return { ok: false, code: "INVALID_CREDENTIALS" };
    }
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        deactivated: true,
        sessionVersion: true,
      },
    });
    if (!user) {
      return { ok: false, code: "INVALID_CREDENTIALS" };
    }
    if (user.deactivated) {
      return { ok: false, code: "DEACTIVATED" };
    }

    const token = await signSession({
      userId: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SEC,
    });

    await stubAudit.write({
      actorId: user.id,
      action: "USER_LOGIN",
      target: `User:${user.id}`,
    });
    stubLogger.info("auth.signIn ok", { userId: user.id });

    return { ok: true, user: toSessionUser(user) };
  },

  async signOut(): Promise<void> {
    const cookieStore = await cookies();
    // H-2: cookie 削除のみ (sessionVersion の increment はオプション)
    // 完全な二重防御が必要な場合はサービス層から increment を呼ぶ。
    // ここでは DB アクセスを避けてシンプルに cookie 削除のみとする。
    cookieStore.delete(COOKIE_NAME);
  },

  async getCurrentUser(): Promise<SessionUser | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    // H-2: verifySession が DB と突き合わせて sessionVersion を検証する
    const payload = await verifySession(token);
    if (!payload) return null;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        deactivated: true,
        sessionVersion: true,
      },
    });
    if (!user) return null;
    return toSessionUser(user);
  },
};
