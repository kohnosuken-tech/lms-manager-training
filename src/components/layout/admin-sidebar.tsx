"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileQuestion,
  ScrollText,
  Sprout,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード", icon: LayoutDashboard, exact: true },
  { href: "/admin/dashboard", label: "進捗レポート", icon: BarChart3, exact: false },
  { href: "/admin/users", label: "ユーザー管理", icon: Users, exact: false },
  { href: "/admin/courses", label: "コース管理", icon: BookOpen, exact: false },
  { href: "/admin/tests", label: "テスト管理", icon: FileQuestion, exact: false },
  { href: "/admin/audit", label: "監査ログ", icon: ScrollText, exact: false },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <Sprout className="size-4.5" aria-hidden="true" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-sidebar-foreground">
            研修 LMS
          </span>
          <span className="text-[10px] text-sidebar-foreground/60">
            管理画面
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="管理ナビゲーション">
        <ul role="list" className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sidebar-primary"
                    />
                  )}
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border px-5 py-3 text-[10px] text-sidebar-foreground/50">
        v1.0 · 内部利用
      </div>
    </aside>
  );
}
