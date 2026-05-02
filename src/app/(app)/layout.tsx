import { requireUser } from "@/server/auth";

/**
 * (app) route group の共通レイアウト。
 * 認証チェックのみ行い、Shell の選択は各サブグループの layout に委ねる。
 * - /admin/** → (app)/admin/layout.tsx が AdminShell を適用
 * - その他    → (app)/(student)/layout.tsx が StudentShell を適用
 *
 * このファイルは children を素通しにする。
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 認証が通らなければ auth.ts 内でリダイレクトされる
  await requireUser();
  return <>{children}</>;
}
