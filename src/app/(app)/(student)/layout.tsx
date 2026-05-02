import { requireUser } from "@/server/auth";
import { StudentShell } from "@/components/layout/student-shell";

/**
 * Student route group レイアウト。
 * トップナビバー構成 (StudentShell)。
 */
export default async function StudentGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <StudentShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role as "ADMIN" | "STUDENT",
      }}
    >
      {children}
    </StudentShell>
  );
}
