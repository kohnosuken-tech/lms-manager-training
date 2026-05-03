"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { container } from "@/server/container";
import {
  isLocked,
  recordFailure,
  resetCounter,
} from "@/server/services/auth-rate-limit";

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SignInActionState = {
  error?: string;
  values?: { email?: string };
};

/**
 * X-Forwarded-For → 最左の IP を取得する。
 * Vercel は信頼できるプロキシが付加するので最左が実クライアント IP。
 * ローカルでは "127.0.0.1" など。
 */
async function getClientIp(): Promise<string> {
  const headerStore = await headers();
  const xff = headerStore.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim();
  }
  // フォールバック: Vercel が付与するリアル IP ヘッダ
  return headerStore.get("x-real-ip") ?? "unknown";
}

export async function signInAction(
  _prev: SignInActionState | undefined,
  formData: FormData,
): Promise<SignInActionState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };

  const parsed = SignInSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: "メールアドレスまたはパスワードが正しくありません。",
      values: { email: raw.email },
    };
  }

  const ip = await getClientIp();
  const email = parsed.data.email;

  // H-1: レートリミットチェック
  if (isLocked(ip, email)) {
    container.logger.warn("auth.sign_in.rate_limited", { ip, email });
    return {
      error: "しばらく時間を置いてからお試しください。",
      values: { email: raw.email },
    };
  }

  const result = await container.auth.signIn(parsed.data);
  if (!result.ok) {
    // 失敗を記録 (DEACTIVATED の場合も失敗扱いとしてカウント — 列挙対策)
    recordFailure(ip, email);
    container.logger.info("auth.sign_in.failed", {
      email,
      reason: result.code,
    });
    return {
      error: "メールアドレスまたはパスワードが正しくありません。",
      values: { email: raw.email },
    };
  }

  // 成功したらカウンタをリセット
  resetCounter(ip, email);

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await container.auth.signOut();
  redirect("/sign-in");
}
