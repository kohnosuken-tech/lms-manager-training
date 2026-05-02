"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BookOpen } from "lucide-react";

type CourseRate = {
  courseId: string;
  courseTitle: string;
  totalEnrollments: number;
  completedEnrollments: number;
  completionRate: number;
};

type Props = {
  courseEnrollmentRates: CourseRate[];
};

export function DashboardCharts({ courseEnrollmentRates }: Props) {
  if (courseEnrollmentRates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card py-16 text-center">
        <BookOpen className="size-10 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          受講データがまだありません。
          <br />
          コースを作成して受講者を割り当てると、ここにグラフが表示されます。
        </p>
      </div>
    );
  }

  // recharts に渡すデータ (タイトルを短縮)
  const chartData = courseEnrollmentRates.map((c) => ({
    name:
      c.courseTitle.length > 12
        ? c.courseTitle.slice(0, 11) + "…"
        : c.courseTitle,
    fullName: c.courseTitle,
    完了: c.completedEnrollments,
    未完了: c.totalEnrollments - c.completedEnrollments,
    rate: c.completionRate,
  }));

  return (
    <div className="rounded-xl border bg-card p-4" role="region" aria-label="コース別受講完了率グラフ">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        コース別 受講完了率
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 8, left: -8, bottom: 4 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.929 0.013 255.508)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "oklch(0.554 0.046 257.417)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "oklch(0.554 0.046 257.417)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "oklch(0.968 0.007 247.896)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as (typeof chartData)[0];
              return (
                <div className="rounded-lg border bg-popover p-3 text-sm shadow-md">
                  <p className="font-medium">{d.fullName}</p>
                  <p className="text-muted-foreground">完了: {d.完了} 件</p>
                  <p className="text-muted-foreground">未完了: {d.未完了} 件</p>
                  <p className="text-primary font-medium">完了率: {d.rate}%</p>
                </div>
              );
            }}
          />
          <Bar dataKey="完了" stackId="a" radius={[0, 0, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill="oklch(0.55 0.22 285)" />
            ))}
          </Bar>
          <Bar dataKey="未完了" stackId="a" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill="oklch(0.929 0.013 255.508)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-4 justify-center">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-2.5 rounded-sm bg-primary" aria-hidden="true" />
          完了
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-2.5 rounded-sm bg-border" aria-hidden="true" />
          未完了
        </span>
      </div>
    </div>
  );
}
