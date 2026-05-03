"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Sprout, LayoutDashboard, BookOpen } from "lucide-react";
import { UserMenu } from "./user-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  user: { name: string; email: string; role: "ADMIN" | "STUDENT" };
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/courses", label: "コース一覧", icon: BookOpen },
] as const;

export function StudentShell({ children, user }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-svh flex flex-col bg-background">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 h-16">
          {/* Hamburger (mobile only) */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden mr-2"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={drawerOpen}
            aria-controls="student-mobile-menu"
          >
            {drawerOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>

          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 font-semibold transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-1"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Sprout className="size-4.5" aria-hidden="true" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">研修 LMS</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                マイラーニング
              </span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1 ml-4 flex-1" aria-label="メインナビゲーション">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 ml-auto">
            {user.role === "ADMIN" && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin">管理画面</Link>
              </Button>
            )}
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        id="student-mobile-menu"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex-col bg-background border-r shadow-lg transition-transform duration-200 md:hidden flex",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="ナビゲーションメニュー"
      >
        {/* Drawer header */}
        <div className="flex h-16 items-center justify-between px-5 border-b">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Sprout className="size-4.5" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold">研修 LMS</span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDrawerOpen(false)}
            aria-label="メニューを閉じる"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Drawer nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="モバイルナビゲーション">
          <ul role="list" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    )}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {user.role === "ADMIN" && (
              <li>
                <Link
                  href="/admin"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                  onClick={() => setDrawerOpen(false)}
                >
                  管理画面
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 pb-10 pt-2">
        {children}
      </main>
    </div>
  );
}
