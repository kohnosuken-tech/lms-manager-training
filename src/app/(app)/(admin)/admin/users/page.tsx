import Link from "next/link";
import { Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import { CreateUserForm } from "./create-user-form";
import { BulkCreateUsersForm } from "./bulk-create-form";
import { UserRowActions } from "./user-row-actions";
import { UsersFilterBar } from "./users-filter-bar";
import type { Prisma, Role } from "@prisma/client";

export const metadata = { title: "ユーザー管理 | LMS" };

const PAGE_SIZE = 20;

type SearchParams = Promise<{
  q?: string;
  role?: string;
  deactivated?: string;
  cursor?: string;
}>;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await requireAdmin();
  const params = await searchParams;

  const q = params.q?.trim() ?? "";
  const roleParam = params.role;
  const deactivatedParam = params.deactivated;
  const cursor = params.cursor;

  // Build where clause
  // SQLite (dev) では mode: "insensitive" が使えないため contains のみ使用。
  // 本番 (Neon Postgres) 切替後は mode: "insensitive" に変更可能。
  const where: Prisma.UserWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
    ...(roleParam === "ADMIN" || roleParam === "STUDENT"
      ? { role: roleParam as Role }
      : {}),
    ...(deactivatedParam === "true"
      ? { deactivated: true }
      : deactivatedParam === "false"
        ? { deactivated: false }
        : {}),
  };

  // Cursor-based pagination: cursor is a user id
  const cursorUser = cursor
    ? await prisma.user.findUnique({
        where: { id: cursor },
        select: { id: true, createdAt: true },
      })
    : null;

  const users = await prisma.user.findMany({
    where: {
      ...where,
      ...(cursorUser
        ? {
            OR: [
              { createdAt: { gt: cursorUser.createdAt } },
              { createdAt: cursorUser.createdAt, id: { gt: cursorUser.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      deactivated: true,
      createdAt: true,
    },
  });

  const hasNext = users.length > PAGE_SIZE;
  const page = hasNext ? users.slice(0, PAGE_SIZE) : users;
  const nextCursor = hasNext ? (page[page.length - 1]?.id ?? null) : null;

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (roleParam) p.set("role", roleParam);
    if (deactivatedParam) p.set("deactivated", deactivatedParam);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) {
        p.delete(k);
      } else {
        p.set(k, v);
      }
    }
    return `/admin/users?${p.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ユーザー管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          受講者・管理者の作成、ロール変更、無効化が行えます。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CreateUserForm />
        <BulkCreateUsersForm />
      </div>

      {/* 検索 / フィルタ */}
      <UsersFilterBar currentQ={q} currentRole={roleParam} currentDeactivated={deactivatedParam} />

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold">名前</TableHead>
              <TableHead className="font-semibold">メールアドレス</TableHead>
              <TableHead className="font-semibold">ロール</TableHead>
              <TableHead className="font-semibold">状態</TableHead>
              <TableHead className="text-right font-semibold">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Users className="size-10 text-muted-foreground/30" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      {q || roleParam || deactivatedParam
                        ? "検索条件に一致するユーザーがいません。"
                        : "ユーザーがまだいません。"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              page.map((u) => (
                <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === me.id ? (
                      <Badge variant="outline" className="ml-2 text-xs">
                        あなた
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                      {u.role === "ADMIN" ? "管理者" : "受講者"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.deactivated ? (
                      <Badge variant="destructive">無効</Badge>
                    ) : (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
                        有効
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserRowActions
                      userId={u.id}
                      name={u.name}
                      role={u.role}
                      deactivated={u.deactivated}
                      isSelf={u.id === me.id}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ページネーション */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {page.length} 件表示
        </div>
        <div className="flex gap-2">
          {cursor ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildUrl({ cursor: undefined })}>
                最初のページ
              </Link>
            </Button>
          ) : null}
          {nextCursor ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildUrl({ cursor: nextCursor })}>
                次へ →
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
