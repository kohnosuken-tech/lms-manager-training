/**
 * prod auth adapter — Clerk 実装 (Phase 4 TODO)
 *
 * 実装手順:
 * 1. `pnpm add @clerk/nextjs` を実行する
 * 2. Vercel ダッシュボードで Clerk Marketplace integration を install し、
 *    CLERK_SECRET_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY を auto-inject させる
 * 3. Clerk Webhook で User 同期エンドポイント (POST /api/webhooks/clerk) を実装し、
 *    CLERK_WEBHOOK_SECRET を設定する
 * 4. 下記 TODO コメントを実際の Clerk 呼び出しに置き換える
 */

import type {
  AuthPort,
  SessionUser,
  SignInInput,
  SignInResult,
} from "@/server/ports/auth";

// TODO(Phase4): import { auth, clerkClient } from "@clerk/nextjs/server";

export const prodAuth: AuthPort = {
  async signIn(_input: SignInInput): Promise<SignInResult> {
    // TODO(Phase4): Clerk は独自のサインインフローを持つため、
    // このメソッドは使わず Clerk の <SignIn /> コンポーネントに委譲する。
    // stub モードとの互換のために実装するが、実際には呼ばれない想定。
    throw new Error(
      "[Phase4] prodAuth.signIn is not implemented. Use Clerk hosted UI.",
    );
  },

  async signOut(): Promise<void> {
    // TODO(Phase4): Clerk の signOut() を呼ぶ
    // import { auth } from "@clerk/nextjs/server";
    // const { sessionId } = await auth();
    // await clerkClient.sessions.revokeSession(sessionId);
    throw new Error("[Phase4] prodAuth.signOut is not implemented.");
  },

  async getCurrentUser(): Promise<SessionUser | null> {
    // TODO(Phase4):
    // 1. Clerk の auth() で userId / sessionClaims を取得
    // 2. sessionClaims の publicMetadata.role を SessionUser.role にマッピング
    //    (STUDENT / ADMIN は Clerk user metadata に保存する)
    // 3. DB の User テーブルと突合して deactivated フラグを確認する
    //
    // 実装例:
    //   const { userId } = await auth();
    //   if (!userId) return null;
    //   const user = await prisma.user.findUnique({ where: { clerkId: userId } });
    //   if (!user || user.deactivated) return null;
    //   return { id: user.id, email: user.email, name: user.name, role: user.role, deactivated: user.deactivated };
    throw new Error("[Phase4] prodAuth.getCurrentUser is not implemented.");
  },
};
