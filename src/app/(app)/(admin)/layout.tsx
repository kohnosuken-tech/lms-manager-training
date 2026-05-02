import { requireAdmin } from "@/server/auth";
import { AdminShell } from "@/components/layout/admin-shell";

/**
 * Admin route group レイアウト。
 * サイドバー + メインの 2 カラム構成 (AdminShell)。
 * requireAdmin() で Server サイドの認可を再確認。
 */
export default async function AdminGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <AdminShell
      user={{
        name: user.name,
        email: user.email,
        role: "ADMIN",
      }}
    >
      {children}
    </AdminShell>
  );
}
