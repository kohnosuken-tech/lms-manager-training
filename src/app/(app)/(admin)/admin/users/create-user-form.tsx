"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUserAction, type CreateUserActionState } from "./actions";

const initialState: CreateUserActionState = {};

export function CreateUserForm() {
  const [state, formAction, isPending] = useActionState(
    createUserAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.successMessage && formRef.current) {
      formRef.current.reset();
    }
  }, [state?.successMessage]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <h2 className="text-base font-medium">ユーザーを個別に作成</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="user-email">メールアドレス</Label>
          <Input
            id="user-email"
            name="email"
            type="email"
            required
            defaultValue={state?.values?.email ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="user-name">氏名</Label>
          <Input
            id="user-name"
            name="name"
            required
            maxLength={100}
            defaultValue={state?.values?.name ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="user-role">ロール</Label>
          <select
            id="user-role"
            name="role"
            defaultValue={state?.values?.role ?? "STUDENT"}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="STUDENT">受講者</option>
            <option value="ADMIN">管理者</option>
          </select>
        </div>
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.successMessage ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.successMessage}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "作成中..." : "作成 + 招待メール"}
      </Button>
    </form>
  );
}
