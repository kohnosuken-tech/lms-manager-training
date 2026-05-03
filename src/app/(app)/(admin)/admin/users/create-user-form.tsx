"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, RequiredLabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUserAction, type CreateUserActionState } from "./actions";

const initialState: CreateUserActionState = {};

export function CreateUserForm() {
  const [state, formAction, isPending] = useActionState(
    createUserAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.successMessage) {
      toast.success(state.successMessage);
      formRef.current?.reset();
    }
    if (state?.error) {
      toast.error(state.error);
    }
  }, [state?.successMessage, state?.error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <h2 className="text-base font-medium">ユーザーを個別に作成</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <RequiredLabel htmlFor="user-email">メールアドレス</RequiredLabel>
          <Input
            id="user-email"
            name="email"
            type="email"
            required
            aria-required="true"
            defaultValue={state?.values?.email ?? ""}
          />
        </div>
        <div className="space-y-1">
          <RequiredLabel htmlFor="user-name">氏名</RequiredLabel>
          <Input
            id="user-name"
            name="name"
            required
            aria-required="true"
            maxLength={100}
            defaultValue={state?.values?.name ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="user-role">ロール</Label>
          <Select name="role" defaultValue={state?.values?.role ?? "STUDENT"}>
            <SelectTrigger id="user-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STUDENT">受講者</SelectItem>
              <SelectItem value="ADMIN">管理者</SelectItem>
            </SelectContent>
          </Select>
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
