"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { AdminSidebar } from "./admin-sidebar";
import { UserMenu } from "./user-menu";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
  user: { name: string; email: string; role: "ADMIN" | "STUDENT" };
};

export function AdminShell({ children, user }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-svh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:shrink-0">
        <AdminSidebar />
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col transition-transform duration-200 lg:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="管理ナビゲーション"
      >
        <AdminSidebar />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between bg-background/80 px-6 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setDrawerOpen((prev) => !prev)}
            aria-label={drawerOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
          <div className="flex-1" />
          <UserMenu name={user.name} email={user.email} role={user.role} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-6 pb-10 pt-2">{children}</div>
        </main>
      </div>
    </div>
  );
}
