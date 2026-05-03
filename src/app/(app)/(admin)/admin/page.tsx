import Link from "next/link";
import { Users, BookOpen, FileQuestion, LayoutDashboard, ScrollText } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";

export const metadata = { title: "管理画面 | LMS" };

export default async function AdminPage() {
  const admin = await requireAdmin();

  const [userCount, allCourses, incompleteCount] = await Promise.all([
    prisma.user.count(),
    container.cms.listCourses(),
    prisma.enrollment.count({ where: { completedAt: null } }),
  ]);

  const courseCount = allCourses.length;

  const links = [
    {
      href: "/admin/users",
      title: "ユーザー管理",
      desc: "受講者・管理者の一覧と CSV 一括登録",
      icon: Users,
    },
    {
      href: "/admin/courses",
      title: "コース / 教材管理",
      desc: "コース、レッスン、動画アップロード",
      icon: BookOpen,
    },
    {
      href: "/admin/tests",
      title: "テスト管理",
      desc: "確認テスト、採点設定",
      icon: FileQuestion,
    },
    {
      href: "/admin/dashboard",
      title: "進捗ダッシュボード",
      desc: "受講率、合格率、CSV エクスポート",
      icon: LayoutDashboard,
    },
    {
      href: "/admin/audit",
      title: "監査ログ",
      desc: "管理操作の履歴を時系列で確認",
      icon: ScrollText,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">管理ダッシュボード</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {admin.name} さん、ようこそ。現在の登録状況です。
        </p>
      </div>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>ユーザー総数</CardDescription>
            <CardTitle className="text-3xl font-bold">{userCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>コース総数</CardDescription>
            <CardTitle className="text-3xl font-bold">{courseCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>未完了 Enrollment</CardDescription>
            <CardTitle className="text-3xl font-bold">{incompleteCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* クイックリンク */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">管理機能</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Card key={l.href} className="h-full rounded-xl shadow-sm">
                <CardHeader>
                  <div className="rounded-lg bg-primary/10 p-2 w-fit">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="mt-3 text-sm font-semibold">
                    {l.title}
                  </CardTitle>
                  <CardDescription className="text-xs">{l.desc}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
