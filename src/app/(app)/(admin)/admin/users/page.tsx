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
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import { CreateUserForm } from "./create-user-form";
import { BulkCreateUsersForm } from "./bulk-create-form";
import { UserRowActions } from "./user-row-actions";

export const metadata = { title: "ユーザー管理 | LMS" };

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      deactivated: true,
      createdAt: true,
    },
  });

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

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
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
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Users className="size-10 text-muted-foreground/30" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">ユーザーがまだいません。</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
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
    </div>
  );
}
