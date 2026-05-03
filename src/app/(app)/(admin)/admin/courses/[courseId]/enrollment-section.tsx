"use client";

import { useActionState, useTransition, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  assignCourseAction,
  unassignCourseAction,
  type AssignActionState,
} from "./enrollment-actions";

type EnrolledRow = {
  userId: string;
  email: string;
  name: string;
  assignedAt: string;
  dueAt: string | null;
  completedAt: string | null;
};

type Candidate = {
  id: string;
  email: string;
  name: string;
};

const initialAssign: AssignActionState = {};

export function EnrollmentSection({
  courseId,
  enrolled,
  candidates,
}: {
  courseId: string;
  enrolled: EnrolledRow[];
  candidates: Candidate[];
}) {
  const [state, action, pending] = useActionState(
    assignCourseAction,
    initialAssign,
  );

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-base font-medium">受講者の割り当て</h2>

      {candidates.length > 0 ? (
        <form action={action} className="space-y-3 rounded-md border p-3">
          <input type="hidden" name="courseId" value={courseId} />
          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2">
              <Label>未割当のユーザー (チェックして追加)</Label>
              <fieldset className="max-h-48 overflow-auto rounded-md border bg-background p-2 text-sm">
                <legend className="sr-only">割り当てるユーザーを選択</legend>
                {candidates.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-1">
                    <Checkbox name="userIds" value={c.id} />
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">({c.email})</span>
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="space-y-1">
              <Label htmlFor="due-at">期限 (任意)</Label>
              <Input id="due-at" name="dueAt" type="date" />
            </div>
          </div>
          {state?.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state?.successMessage ? (
            <p className="text-sm text-emerald-700">{state.successMessage}</p>
          ) : null}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "割当中..." : "選択ユーザーに割り当て"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          全ユーザーに割当済みです。
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>受講者</TableHead>
            <TableHead>メールアドレス</TableHead>
            <TableHead>割当日</TableHead>
            <TableHead>期限</TableHead>
            <TableHead>状態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enrolled.map((e) => (
            <UnassignRow key={e.userId} courseId={courseId} row={e} />
          ))}
          {enrolled.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                まだ割り当てがありません。
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function UnassignRow({
  courseId,
  row,
}: {
  courseId: string;
  row: EnrolledRow;
}) {
  const [pending, start] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);

  const onConfirmUnassign = () => {
    const fd = new FormData();
    fd.set("courseId", courseId);
    fd.set("userId", row.userId);
    setDialogOpen(false);
    start(async () => {
      const r = await unassignCourseAction(fd);
      if (r.ok) {
        toast.success(`${row.name} の割当を解除しました`);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>{row.email}</TableCell>
      <TableCell>{row.assignedAt}</TableCell>
      <TableCell>{row.dueAt ?? "—"}</TableCell>
      <TableCell>
        {row.completedAt ? (
          <Badge>完了</Badge>
        ) : (
          <Badge variant="secondary">受講中</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          size="xs"
          variant="destructive"
          onClick={() => setDialogOpen(true)}
          disabled={pending}
        >
          {pending ? "解除中..." : "割当解除"}
        </Button>
        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>受講者の割当を解除しますか?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{row.name}</strong> をこのコースから外します。視聴済みの進捗データは保持されますが、コース一覧には表示されなくなります。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirmUnassign}>
                割当を解除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
