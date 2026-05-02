import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { UserMenu } from "./user-menu";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
  user: { name: string; email: string; role: "ADMIN" | "STUDENT" };
};

export function StudentShell({ children, user }: Props) {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 h-14">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
          >
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="size-4" aria-hidden="true" />
            </div>
            <span>LMS 研修管理</span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {user.role === "ADMIN" && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin">管理画面</Link>
              </Button>
            )}
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
