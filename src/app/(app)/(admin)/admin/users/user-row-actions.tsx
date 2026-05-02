"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { changeRoleAction, deactivateUserAction } from "./actions";

type Props = {
  userId: string;
  role: "STUDENT" | "ADMIN";
  deactivated: boolean;
  isSelf: boolean;
};

export function UserRowActions({ userId, role, deactivated, isSelf }: Props) {
  const [pending, start] = useTransition();

  const onToggleRole = () => {
    if (isSelf) return;
    const next = role === "ADMIN" ? "STUDENT" : "ADMIN";
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("role", next);
    start(async () => {
      await changeRoleAction(fd);
    });
  };

  const onToggleActive = () => {
    if (isSelf && !deactivated) return;
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("deactivated", deactivated ? "false" : "true");
    start(async () => {
      await deactivateUserAction(fd);
    });
  };

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={onToggleRole}
        disabled={pending || isSelf}
        title={isSelf ? "自分自身は変更不可" : ""}
      >
        {role === "ADMIN" ? "受講者へ" : "管理者へ"}
      </Button>
      <Button
        type="button"
        size="xs"
        variant={deactivated ? "outline" : "destructive"}
        onClick={onToggleActive}
        disabled={pending || (isSelf && !deactivated)}
        title={isSelf && !deactivated ? "自分自身は無効化不可" : ""}
      >
        {deactivated ? "有効化" : "無効化"}
      </Button>
    </div>
  );
}
