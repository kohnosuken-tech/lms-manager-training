"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  publishCourseAction,
  updateCourseAction,
} from "../actions";

type Props = {
  course: {
    id: string;
    title: string;
    description: string;
    order: number;
    published: boolean;
  };
};

export function CourseMetaForm({ course }: Props) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const onSave = (fd: FormData) => {
    fd.set("id", course.id);
    start(async () => {
      const r = await updateCourseAction(fd);
      setMessage(r.ok ? "保存しました。" : r.error.message);
    });
  };

  const onPublish = (next: boolean) => {
    const fd = new FormData();
    fd.set("id", course.id);
    fd.set("published", next ? "true" : "false");
    start(async () => {
      const r = await publishCourseAction(fd);
      setMessage(
        r.ok ? `${next ? "公開" : "非公開"}に切り替えました。` : r.error.message,
      );
    });
  };

  return (
    <form
      action={onSave}
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">コース基本情報</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className={course.published ? "text-emerald-700" : "text-muted-foreground"}>
            {course.published ? "公開中" : "下書き"}
          </span>
          <Button
            type="button"
            size="sm"
            variant={course.published ? "outline" : "default"}
            onClick={() => onPublish(!course.published)}
            disabled={pending}
          >
            {course.published ? "非公開にする" : "公開する"}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="course-title">タイトル</Label>
          <Input
            id="course-title"
            name="title"
            required
            maxLength={200}
            defaultValue={course.title}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="course-order">表示順</Label>
          <Input
            id="course-order"
            name="order"
            type="number"
            min={0}
            defaultValue={course.order}
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
          defaultValue={course.description}
        />
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
