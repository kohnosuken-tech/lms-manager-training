"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import {
  createLesson,
  updateLesson,
  deleteLesson,
} from "@/server/services/course";
import { AppError } from "@/lib/errors";
import { ok, err, type ApiResult } from "@/lib/result";
import { isValidVideoUrl } from "@/lib/video-source";

const VideoUrlSchema = z.string().refine(isValidVideoUrl, {
  message:
    "videoUrl は /sample.mp4、/uploads/<key>.mp4、Vercel Blob、YouTube URL のいずれかである必要があります。",
});

const CreateSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  videoUrl: VideoUrlSchema.default("/sample.mp4"),
  durationSec: z.coerce.number().int().min(0),
  order: z.coerce.number().int().min(0),
  blockSeek: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional(),
  requiredCompletionRate: z
    .union([z.coerce.number().min(0).max(1), z.literal("")])
    .optional(),
});

export type CreateLessonActionState = {
  error?: string;
  values?: Record<string, string>;
  successMessage?: string;
};

export async function createLessonAction(
  _prev: CreateLessonActionState | undefined,
  formData: FormData,
): Promise<CreateLessonActionState> {
  const actor = await requireAdmin();
  const raw = {
    courseId: String(formData.get("courseId") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? ""),
    videoUrl: String(formData.get("videoUrl") ?? "/sample.mp4"),
    durationSec: String(formData.get("durationSec") ?? "0"),
    order: String(formData.get("order") ?? "0"),
    blockSeek: String(formData.get("blockSeek") ?? ""),
    requiredCompletionRate: String(formData.get("requiredCompletionRate") ?? ""),
  };
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "入力値が不正です。", values: raw };
  }

  try {
    await createLesson(actor.id, {
      courseId: parsed.data.courseId,
      title: parsed.data.title,
      description: parsed.data.description,
      videoUrl: parsed.data.videoUrl,
      durationSec: parsed.data.durationSec,
      order: parsed.data.order,
      blockSeek: parsed.data.blockSeek === "on" || parsed.data.blockSeek === "true",
      requiredCompletionRate:
        parsed.data.requiredCompletionRate === "" ||
        parsed.data.requiredCompletionRate === undefined
          ? null
          : parsed.data.requiredCompletionRate,
    });
    revalidatePath(`/admin/courses/${parsed.data.courseId}`);
    return { successMessage: "レッスンを追加しました。" };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, values: raw };
    return { error: "作成に失敗しました。", values: raw };
  }
}

const UpdateSchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000),
  videoUrl: VideoUrlSchema,
  durationSec: z.coerce.number().int().min(0),
  order: z.coerce.number().int().min(0),
  blockSeek: z.enum(["true", "false"]),
  requiredCompletionRate: z
    .union([z.coerce.number().min(0).max(1), z.literal("")])
    .optional(),
});

export async function updateLessonAction(
  formData: FormData,
): Promise<ApiResult<null>> {
  const actor = await requireAdmin();
  const parsed = UpdateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    courseId: String(formData.get("courseId") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    videoUrl: String(formData.get("videoUrl") ?? ""),
    durationSec: String(formData.get("durationSec") ?? "0"),
    order: String(formData.get("order") ?? "0"),
    blockSeek: String(formData.get("blockSeek") ?? "false"),
    requiredCompletionRate: String(formData.get("requiredCompletionRate") ?? ""),
  });
  if (!parsed.success) return err("VALIDATION_FAILED", "入力値が不正です。");
  try {
    await updateLesson(actor.id, {
      id: parsed.data.id,
      title: parsed.data.title,
      description: parsed.data.description,
      videoUrl: parsed.data.videoUrl,
      durationSec: parsed.data.durationSec,
      order: parsed.data.order,
      blockSeek: parsed.data.blockSeek === "true",
      requiredCompletionRate:
        parsed.data.requiredCompletionRate === "" ||
        parsed.data.requiredCompletionRate === undefined
          ? null
          : parsed.data.requiredCompletionRate,
    });
    revalidatePath(`/admin/courses/${parsed.data.courseId}`);
    return ok(null);
  } catch (e) {
    if (e instanceof AppError) return err(e.code, e.message);
    return err("INTERNAL", "更新に失敗しました。");
  }
}

const DeleteSchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
});

export async function deleteLessonAction(
  formData: FormData,
): Promise<ApiResult<null>> {
  const actor = await requireAdmin();
  const parsed = DeleteSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    courseId: String(formData.get("courseId") ?? ""),
  });
  if (!parsed.success) return err("VALIDATION_FAILED", "入力値が不正です。");
  try {
    await deleteLesson(actor.id, parsed.data.id);
    revalidatePath(`/admin/courses/${parsed.data.courseId}`);
    return ok(null);
  } catch (e) {
    if (e instanceof AppError) return err(e.code, e.message);
    return err("INTERNAL", "削除に失敗しました。");
  }
}
