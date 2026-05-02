"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import {
  createCourse,
  updateCourse,
  publishCourse,
} from "@/server/services/course";
import { AppError } from "@/lib/errors";
import { ok, err, type ApiResult } from "@/lib/result";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  order: z.coerce.number().int().min(0).default(0),
});

export type CreateCourseActionState = {
  error?: string;
  values?: { title?: string; description?: string; order?: string };
};

export async function createCourseAction(
  _prev: CreateCourseActionState | undefined,
  formData: FormData,
): Promise<CreateCourseActionState> {
  const actor = await requireAdmin();
  const raw = {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? ""),
    order: String(formData.get("order") ?? "0"),
  };
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "入力値が不正です。", values: raw };
  }

  let courseId: string;
  try {
    const r = await createCourse(actor.id, parsed.data);
    courseId = r.courseId;
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, values: raw };
    return { error: "コース作成に失敗しました。", values: raw };
  }
  revalidatePath("/admin/courses");
  redirect(`/admin/courses/${courseId}`);
}

const UpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000),
  order: z.coerce.number().int().min(0),
});

export async function updateCourseAction(
  formData: FormData,
): Promise<ApiResult<null>> {
  const actor = await requireAdmin();
  const parsed = UpdateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    order: String(formData.get("order") ?? "0"),
  });
  if (!parsed.success) return err("VALIDATION_FAILED", "入力値が不正です。");
  try {
    await updateCourse(actor.id, parsed.data);
    revalidatePath(`/admin/courses/${parsed.data.id}`);
    revalidatePath("/admin/courses");
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

export async function publishCourseAction(
  formData: FormData,
): Promise<ApiResult<null>> {
  const actor = await requireAdmin();
  const parsed = PublishSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    published: String(formData.get("published") ?? ""),
  });
  if (!parsed.success) return err("VALIDATION_FAILED", "入力値が不正です。");
  try {
    await publishCourse(actor.id, parsed.data.id, parsed.data.published === "true");
    revalidatePath(`/admin/courses/${parsed.data.id}`);
    revalidatePath("/admin/courses");
    return ok(null);
  } catch (e) {
    if (e instanceof AppError) return err(e.code, e.message);
    return err("INTERNAL", "更新に失敗しました。");
  }
}
