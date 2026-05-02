"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createLessonServerAction,
  deleteLessonAction,
  updateLessonAction,
} from "./lesson-actions";
import { VideoUploadField } from "./video-upload-field";

type Lesson = {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  durationSec: number;
  order: number;
  blockSeek: boolean;
  requiredCompletionRate: number | null;
};

export function LessonsSection({
  courseId,
  lessons,
}: {
  courseId: string;
  lessons: Lesson[];
}) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-base font-medium">レッスン</h2>

      <form action={createLessonServerAction} noValidate className="space-y-2 rounded-md border p-3">
        <input type="hidden" name="courseId" value={courseId} />
        <div className="grid gap-2 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="new-lesson-title">タイトル</Label>
            <Input
              id="new-lesson-title"
              name="title"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-lesson-duration">再生時間 (秒)</Label>
            <Input
              id="new-lesson-duration"
              name="durationSec"
              type="number"
              min={0}
              defaultValue="600"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-lesson-order">表示順</Label>
            <Input
              id="new-lesson-order"
              name="order"
              type="number"
              min={0}
              defaultValue={String(lessons.length)}
            />
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-1 md:col-span-2">
            <VideoUploadField
              name="videoUrl"
              defaultValue="/sample.mp4"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-lesson-rate">完了率しきい値 (任意 / 0-1)</Label>
            <Input
              id="new-lesson-rate"
              name="requiredCompletionRate"
              type="number"
              step="0.01"
              min={0}
              max={1}
              placeholder="0.95"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-lesson-desc">説明</Label>
          <Textarea
            id="new-lesson-desc"
            name="description"
            rows={2}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="blockSeek" />
            早送り抑止
          </label>
          <Button type="submit" size="sm" className="ml-auto">
            レッスン追加
          </Button>
        </div>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>順</TableHead>
            <TableHead>タイトル</TableHead>
            <TableHead>動画 URL</TableHead>
            <TableHead>長さ</TableHead>
            <TableHead>抑止</TableHead>
            <TableHead>完了率</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lessons.map((l) => (
            <LessonRow key={l.id} lesson={l} courseId={courseId} />
          ))}
          {lessons.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                まだレッスンがありません。
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function LessonRow({ lesson, courseId }: { lesson: Lesson; courseId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSave = (fd: FormData) => {
    fd.set("id", lesson.id);
    fd.set("courseId", courseId);
    start(async () => {
      const r = await updateLessonAction(fd);
      if (r.ok) {
        setEditing(false);
        setError(null);
        router.refresh();
      } else {
        setError(r.error.message);
      }
    });
  };

  const onDelete = () => {
    if (!confirm(`「${lesson.title}」を削除します。よろしいですか?`)) return;
    const fd = new FormData();
    fd.set("id", lesson.id);
    fd.set("courseId", courseId);
    start(async () => {
      const r = await deleteLessonAction(fd);
      if (r.ok) {
        router.refresh();
      } else {
        setError(r.error.message);
      }
    });
  };

  if (!editing) {
    return (
      <TableRow>
        <TableCell>{lesson.order}</TableCell>
        <TableCell className="font-medium">{lesson.title}</TableCell>
        <TableCell className="font-mono text-xs">{lesson.videoUrl}</TableCell>
        <TableCell>{lesson.durationSec}s</TableCell>
        <TableCell>{lesson.blockSeek ? "ON" : "—"}</TableCell>
        <TableCell>
          {lesson.requiredCompletionRate ?? "0.95 (既定)"}
        </TableCell>
        <TableCell className="text-right space-x-1">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setEditing(true)}
            disabled={pending}
          >
            編集
          </Button>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            onClick={onDelete}
            disabled={pending}
          >
            削除
          </Button>
          {error ? (
            <span className="ml-2 text-xs text-destructive">{error}</span>
          ) : null}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell colSpan={7}>
        <form action={onSave} noValidate className="space-y-2 py-2">
          <div className="grid gap-2 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor={`order-${lesson.id}`}>順</Label>
              <Input
                id={`order-${lesson.id}`}
                name="order"
                type="number"
                min={0}
                defaultValue={lesson.order}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`title-${lesson.id}`}>タイトル</Label>
              <Input
                id={`title-${lesson.id}`}
                name="title"
                defaultValue={lesson.title}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`duration-${lesson.id}`}>長さ (秒)</Label>
              <Input
                id={`duration-${lesson.id}`}
                name="durationSec"
                type="number"
                min={0}
                defaultValue={lesson.durationSec}
              />
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2">
              <VideoUploadField
                name="videoUrl"
                defaultValue={lesson.videoUrl}
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`rate-${lesson.id}`}>完了率 (空=0.95)</Label>
              <Input
                id={`rate-${lesson.id}`}
                name="requiredCompletionRate"
                type="number"
                step="0.01"
                min={0}
                max={1}
                defaultValue={lesson.requiredCompletionRate ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`desc-${lesson.id}`}>説明</Label>
            <Textarea
              id={`desc-${lesson.id}`}
              name="description"
              rows={2}
              defaultValue={lesson.description}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="hidden"
                name="blockSeek"
                value={lesson.blockSeek ? "true" : "false"}
              />
              <input
                type="checkbox"
                defaultChecked={lesson.blockSeek}
                onChange={(e) => {
                  const f = e.currentTarget.form;
                  if (!f) return;
                  const hidden = f.elements.namedItem(
                    "blockSeek",
                  ) as HTMLInputElement | null;
                  if (hidden) hidden.value = e.currentTarget.checked ? "true" : "false";
                }}
              />
              早送り抑止
            </label>
            {error ? (
              <span className="text-sm text-destructive">{error}</span>
            ) : null}
            <div className="ml-auto space-x-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                キャンセル
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </form>
      </TableCell>
    </TableRow>
  );
}
