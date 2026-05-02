"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createCourseAction,
  type CreateCourseActionState,
} from "./actions";

const initial: CreateCourseActionState = {};

export function CreateCourseForm() {
  const [state, formAction, isPending] = useActionState(
    createCourseAction,
    initial,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <h2 className="text-base font-medium">新しいコースを作成</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="course-title">タイトル</Label>
          <Input
            id="course-title"
            name="title"
            required
            maxLength={200}
            defaultValue={state?.values?.title ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="course-order">表示順</Label>
          <Input
            id="course-order"
            name="order"
            type="number"
            min={0}
            defaultValue={state?.values?.order ?? "0"}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="course-desc">説明</Label>
        <Textarea
          id="course-desc"
          name="description"
          rows={3}
          maxLength={1000}
          defaultValue={state?.values?.description ?? ""}
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "作成中..." : "コースを作成"}
      </Button>
    </form>
  );
}
