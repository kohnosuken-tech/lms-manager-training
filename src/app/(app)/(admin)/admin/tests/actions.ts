"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import {
  createTest,
  updateTest,
  publishTest,
} from "@/server/services/test-admin";
import { AppError } from "@/lib/errors";
import { ok, err, type ApiResult } from "@/lib/result";

const CreateSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  prerequisiteCourseId: z.string().optional(),
  passingScore: z.coerce.number().int().min(0).max(100),
  maxAttempts: z.coerce.number().int().min(1).max(100),
  timeLimitSec: z.union([z.coerce.number().int().min(0), z.literal("")]).optional(),
});

export type CreateTestActionState = {
  error?: string;
  values?: Record<string, string>;
};

export async function createTestAction(
  _prev: CreateTestActionState | undefined,
  formData: FormData,
): Promise<CreateTestActionState> {
  const actor = await requireAdmin();
  const raw = {
    courseId: String(formData.get("courseId") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? ""),
    prerequisiteCourseId: String(formData.get("prerequisiteCourseId") ?? ""),
    passingScore: String(formData.get("passingScore") ?? "70"),
    maxAttempts: String(formData.get("maxAttempts") ?? "3"),
    timeLimitSec: String(formData.get("timeLimitSec") ?? ""),
  };
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "入力値が不正です。", values: raw };
  }

  let testId: string;
  try {
    const r = await createTest(actor.id, {
      courseId: parsed.data.courseId,
      title: parsed.data.title,
      description: parsed.data.description,
      prerequisiteCourseId:
        parsed.data.prerequisiteCourseId &&
        parsed.data.prerequisiteCourseId.length > 0
          ? parsed.data.prerequisiteCourseId
          : null,
      passingScore: parsed.data.passingScore,
      maxAttempts: parsed.data.maxAttempts,
      timeLimitSec:
        parsed.data.timeLimitSec === "" || parsed.data.timeLimitSec === undefined
          ? null
          : parsed.data.timeLimitSec,
    });
    testId = r.testId;
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, values: raw };
    return { error: "テスト作成に失敗しました。", values: raw };
  }
  revalidatePath("/admin/tests");
  redirect(`/admin/tests/${testId}`);
}

const UpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000),
  prerequisiteCourseId: z.string().optional(),
  passingScore: z.coerce.number().int().min(0).max(100),
  maxAttempts: z.coerce.number().int().min(1).max(100),
  timeLimitSec: z.union([z.coerce.number().int().min(0), z.literal("")]).optional(),
});

export async function updateTestAction(
  formData: FormData,
): Promise<ApiResult<null>> {
  const actor = await requireAdmin();
  const parsed = UpdateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    prerequisiteCourseId: String(formData.get("prerequisiteCourseId") ?? ""),
    passingScore: String(formData.get("passingScore") ?? "70"),
    maxAttempts: String(formData.get("maxAttempts") ?? "3"),
    timeLimitSec: String(formData.get("timeLimitSec") ?? ""),
  });
  if (!parsed.success) return err("VALIDATION_FAILED", "入力値が不正です。");
  try {
    await updateTest(actor.id, {
      id: parsed.data.id,
      title: parsed.data.title,
      description: parsed.data.description,
      prerequisiteCourseId:
        parsed.data.prerequisiteCourseId &&
        parsed.data.prerequisiteCourseId.length > 0
          ? parsed.data.prerequisiteCourseId
          : null,
      passingScore: parsed.data.passingScore,
      maxAttempts: parsed.data.maxAttempts,
      timeLimitSec:
        parsed.data.timeLimitSec === "" || parsed.data.timeLimitSec === undefined
          ? null
          : parsed.data.timeLimitSec,
    });
    revalidatePath(`/admin/tests/${parsed.data.id}`);
    revalidatePath("/admin/tests");
    return ok(null);
  } catch (e) {
    if (e instanceof AppError) return err(e.code, e.message);
    return err("INTERNAL", "更新に失敗しました。");
  }
}

const PublishSchema = z.object({
  id: z.string().min(1),
  published: z.enum(["true", "false"]),
});

export async function publishTestAction(
  formData: FormData,
): Promise<ApiResult<null>> {
  const actor = await requireAdmin();
  const parsed = PublishSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    published: String(formData.get("published") ?? ""),
  });
  if (!parsed.success) return err("VALIDATION_FAILED", "入力値が不正です。");
  try {
    await publishTest(actor.id, parsed.data.id, parsed.data.published === "true");
    revalidatePath(`/admin/tests/${parsed.data.id}`);
    revalidatePath("/admin/tests");
    return ok(null);
  } catch (e) {
    if (e instanceof AppError) return err(e.code, e.message);
    return err("INTERNAL", "更新に失敗しました。");
  }
}
