import { Download, Users, TrendingUp, AlertCircle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/server/auth";
import { getAdminDashboard } from "@/server/services/report";
import { DashboardCharts } from "@/components/feature/DashboardCharts";

export const metadata = { title: "進捗ダッシュボード | LMS" };

export default async function AdminDashboardPage() {
  await requireAdmin();
  const data = await getAdminDashboard();

  const kpis = [
    {
      label: "総 Enrollment",
      value: data.totalEnrollments,
      sub: `完了済み ${data.completedEnrollments} 件`,
      icon: Users,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-50 dark:bg-blue-950/30",
    },
    {
      label: "全体完了率",
      value: `${data.overallCompletionRate}%`,
      sub: "受講者全体の平均",
      icon: TrendingUp,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      label: "30 日合格率",
      value: `${data.testPassRateLast30Days}%`,
      sub: "直近 30 日のテスト",
      icon: BookOpen,
      iconColor: "text-teal-500",
      iconBg: "bg-teal-50 dark:bg-teal-950/30",
    },
    {
      label: "期限超過",
      value: data.overdueEnrollments,
      sub: "要フォロー",
      icon: AlertCircle,
      iconColor: data.overdueEnrollments > 0 ? "text-rose-500" : "text-muted-foreground",
      iconBg: data.overdueEnrollments > 0 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-muted",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">進捗ダッシュボード</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          全受講者の受講状況とテスト合格率を集計しています。
        </p>
      </div>

      {/* KPI カード */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="rounded-xl shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className={`rounded-lg p-2 ${kpi.iconBg}`}>
                    <Icon className={`size-4 ${kpi.iconColor}`} aria-hidden="true" />
                  </div>
                </div>
                <CardDescription className="mt-3">{kpi.label}</CardDescription>
                <CardTitle className="text-3xl font-bold tracking-tight">
                  {kpi.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* チャート (client component) */}
      <DashboardCharts courseEnrollmentRates={data.courseEnrollmentRates} />

      {/* CSV エクスポート */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">CSV エクスポート</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { href: "/api/admin/export?type=users", label: "ユーザー一覧" },
            { href: "/api/admin/export?type=courses", label: "コース一覧" },
            { href: "/api/admin/export?type=progress", label: "受講進捗" },
          ].map((item) => (
            <Button key={item.href} asChild variant="outline" size="sm">
              <a href={item.href} download className="flex items-center gap-2">
                <Download className="size-3.5" aria-hidden="true" />
                {item.label}
              </a>
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
