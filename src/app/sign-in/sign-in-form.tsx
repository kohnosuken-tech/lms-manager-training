"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RequiredLabel } from "@/components/ui/label";
import { signInAction, type SignInActionState } from "./actions";

const initialState: SignInActionState = {};

export function SignInForm() {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <RequiredLabel htmlFor="email">メールアドレス</RequiredLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-required="true"
          defaultValue={state?.values?.email ?? ""}
        />
      </div>
      <div className="space-y-2">
        <RequiredLabel htmlFor="password">パスワード</RequiredLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-required="true"
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "サインイン中..." : "サインイン"}
      </Button>
    </form>
  );
}
