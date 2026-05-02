"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createTestAction,
  type CreateTestActionState,
} from "./actions";

const initial: CreateTestActionState = {};

type Course = { id: string; title: string };

export function CreateTestForm({ courses }: { courses: Course[] }) {
  const [state, formAction, isPending] = useActionState(
    createTestAction,
    initial,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <h2 className="text-base font-medium">新しいテストを作成</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="test-course">対象コース</Label>
          <select
            id="test-course"
            name="courseId"
            required
            defaultValue={state?.values?.courseId ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="" disabled>
              選択してください
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="test-title">テスト名</Label>
          <Input
            id="test-title"
            name="title"
            required
            maxLength={200}
            defaultValue={state?.values?.title ?? ""}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="test-desc">説明</Label>
        <Textarea
          id="test-desc"
          name="description"
          rows={2}
          maxLength={1000}
          defaultValue={state?.values?.description ?? ""}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="test-pass">合格点 (%)</Label>
          <Input
            id="test-pass"
            name="passingScore"
            type="number"
            min={0}
            max={100}
            defaultValue={state?.values?.passingScore ?? "70"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="test-attempts">受験上限</Label>
          <Input
            id="test-attempts"
            name="maxAttempts"
            type="number"
            min={1}
            max={100}
            defaultValue={state?.values?.maxAttempts ?? "3"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="test-time">時間制限 (秒・空=無制限)</Label>
          <Input
            id="test-time"
            name="timeLimitSec"
            type="number"
            min={0}
            defaultValue={state?.values?.timeLimitSec ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="test-prereq">前提コース (任意)</Label>
          <select
            id="test-prereq"
            name="prerequisiteCourseId"
            defaultValue={state?.values?.prerequisiteCourseId ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="">指定しない</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "作成中..." : "テストを作成"}
      </Button>
    </form>
  );
}
