"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { publishTestAction, updateTestAction } from "../actions";

type Test = {
  id: string;
  title: string;
  description: string;
  passingScore: number;
  maxAttempts: number;
  timeLimitSec: number | null;
  prerequisiteCourseId: string | null;
  published: boolean;
};

type Course = { id: string; title: string };

export function TestMetaForm({
  test,
  courses,
}: {
  test: Test;
  courses: Course[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const onSave = (fd: FormData) => {
    fd.set("id", test.id);
    start(async () => {
      const r = await updateTestAction(fd);
      setMessage(r.ok ? "保存しました。" : r.error.message);
    });
  };

  const onPublish = (next: boolean) => {
    const fd = new FormData();
    fd.set("id", test.id);
    fd.set("published", next ? "true" : "false");
    start(async () => {
      const r = await publishTestAction(fd);
      setMessage(
        r.ok ? `${next ? "公開" : "非公開"}にしました。` : r.error.message,
      );
    });
  };

  return (
    <form
      action={onSave}
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">テスト基本情報</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className={test.published ? "text-emerald-700" : "text-muted-foreground"}>
            {test.published ? "公開中" : "下書き"}
          </span>
          <Button
            type="button"
            size="sm"
            variant={test.published ? "outline" : "default"}
            onClick={() => onPublish(!test.published)}
            disabled={pending}
          >
            {test.published ? "非公開にする" : "公開する"}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="t-title">タイトル</Label>
        <Input
          id="t-title"
          name="title"
          required
          maxLength={200}
          defaultValue={test.title}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="t-desc">説明</Label>
        <Textarea
          id="t-desc"
          name="description"
          rows={2}
          maxLength={1000}
          defaultValue={test.description}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="t-pass">合格点 (%)</Label>
          <Input
            id="t-pass"
            name="passingScore"
            type="number"
            min={0}
            max={100}
            defaultValue={test.passingScore}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-att">受験上限</Label>
          <Input
            id="t-att"
            name="maxAttempts"
            type="number"
            min={1}
            max={100}
            defaultValue={test.maxAttempts}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-time">時間制限 (秒)</Label>
          <Input
            id="t-time"
            name="timeLimitSec"
            type="number"
            min={0}
            defaultValue={test.timeLimitSec ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-prereq">前提コース</Label>
          <select
            id="t-prereq"
            name="prerequisiteCourseId"
            defaultValue={test.prerequisiteCourseId ?? ""}
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
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
