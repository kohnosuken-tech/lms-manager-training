"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { changeRoleAction, deactivateUserAction } from "./actions";

type Props = {
  userId: string;
  name: string;
  role: "STUDENT" | "ADMIN";
  deactivated: boolean;
  isSelf: boolean;
};

export function UserRowActions({
  userId,
  name,
  role,
  deactivated,
  isSelf,
}: Props) {
  const [pending, start] = useTransition();
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [activeDialogOpen, setActiveDialogOpen] = useState(false);

  const next = role === "ADMIN" ? "STUDENT" : "ADMIN";

  const onConfirmRole = () => {
    if (isSelf) return;
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("role", next);
    setRoleDialogOpen(false);
    start(async () => {
      const r = await changeRoleAction(fd);
      if (r.ok) {
        toast.success(`${name} のロールを ${next === "ADMIN" ? "管理者" : "受講者"} に変更しました`);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const onConfirmActive = () => {
    if (isSelf && !deactivated) return;
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("deactivated", deactivated ? "false" : "true");
    setActiveDialogOpen(false);
    start(async () => {
      const r = await deactivateUserAction(fd);
      if (r.ok) {
        toast.success(deactivated ? `${name} を有効化しました` : `${name} を無効化しました`);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => setRoleDialogOpen(true)}
        disabled={pending || isSelf}
        title={isSelf ? "自分自身は変更不可" : ""}
      >
        {role === "ADMIN" ? "受講者へ" : "管理者へ"}
      </Button>
      <Button
        type="button"
        size="xs"
        variant={deactivated ? "outline" : "destructive"}
        onClick={() => setActiveDialogOpen(true)}
        disabled={pending || (isSelf && !deactivated)}
        title={isSelf && !deactivated ? "自分自身は無効化不可" : ""}
      >
        {deactivated ? "有効化" : "無効化"}
      </Button>

      <AlertDialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ロールを変更しますか?</AlertDialogTitle>
            <AlertDialogDescription>
              {name} のロールを{" "}
              <strong>{next === "ADMIN" ? "管理者" : "受講者"}</strong> に変更します。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmRole}>変更する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={activeDialogOpen} onOpenChange={setActiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deactivated ? "ユーザーを有効化しますか?" : "ユーザーを無効化しますか?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deactivated
                ? `${name} を再び有効化し、ログインできるようにします。`
                : `${name} のログインを停止します。受講中のコース・進捗・テスト履歴は保持されます。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmActive}>
              {deactivated ? "有効化する" : "無効化する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
