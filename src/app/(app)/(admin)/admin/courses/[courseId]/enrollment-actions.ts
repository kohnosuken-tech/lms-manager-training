"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { assignCourse, unassignCourse } from "@/server/services/course";
import { AppError } from "@/lib/errors";
import { ok, err, type ApiResult } from "@/lib/result";

const AssignSchema = z.object({
  courseId: z.string().min(1),
  userIds: z.array(z.string().min(1)).min(1),
  dueAt: z.string().optional(),
});

export type AssignActionState = {
  error?: string;
  successMessage?: string;
};

export async function assignCourseAction(
  _prev: AssignActionState | undefined,
  formData: FormData,
): Promise<AssignActionState> {
  const actor = await requireAdmin();
  const userIds = formData.getAll("userIds").map((v) => String(v));
  const dueAt = String(formData.get("dueAt") ?? "");
  const courseId = String(formData.get("courseId") ?? "");

  const parsed = AssignSchema.safeParse({
    courseId,
    userIds,
    dueAt: dueAt || undefined,
  });
  if (!parsed.success) {
    return { error: "ユーザーを 1 人以上選択してください。" };
  }

  let due: Date | null = null;
  if (parsed.data.dueAt) {
    const d = new Date(parsed.data.dueAt);
    if (Number.isNaN(d.getTime())) {
      return { error: "期限の日付形式が不正です。" };
    }
    due = d;
  }

  try {
    const r = await assignCourse(actor.id, {
      courseId: parsed.data.courseId,
      userIds: parsed.data.userIds,
      dueAt: due,
    });
    revalidatePath(`/admin/courses/${parsed.data.courseId}`);
    return { successMessage: `${r.assigned} 件割り当てました。` };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    return { error: "割当に失敗しました。" };
  }
}

const UnassignSchema = z.object({
  userId: z.string().min(1),
  courseId: z.string().min(1),
});

export async function unassignCourseAction(
  formData: FormData,
): Promise<ApiResult<null>> {
  const actor = await requireAdmin();
  const parsed = UnassignSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    courseId: String(formData.get("courseId") ?? ""),
  });
  if (!parsed.success) return err("VALIDATION_FAILED", "入力値が不正です。");
  try {
    await unassignCourse(actor.id, parsed.data.userId, parsed.data.courseId);
    revalidatePath(`/admin/courses/${parsed.data.courseId}`);
    return ok(null);
  } catch (e) {
    if (e instanceof AppError) return err(e.code, e.message);
    return err("INTERNAL", "解除に失敗しました。");
  }
}
