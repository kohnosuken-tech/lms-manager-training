"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import {
  createLesson,
  updateLesson,
  deleteLesson,
} from "@/server/services/course";
import { AppError } from "@/lib/errors";
import { ok, err, type ApiResult } from "@/lib/result";
import { isValidVideoUrl, parseVideoSource } from "@/lib/video-source";
import { fetchYouTubeMeta } from "@/lib/youtube-meta";

/**
 * videoUrl が YouTube かつ durationSec が 0 の場合のみ、
 * YouTube watch ページから lengthSeconds を取得して上書きする。
 * 取得失敗時はユーザー入力 (= 0) のまま返す。
 */
async function resolveDurationSec(
  videoUrl: string,
  durationSec: number,
): Promise<number> {
  if (durationSec > 0) return durationSec;
  const source = parseVideoSource(videoUrl);
  if (!source || source.type !== "YOUTUBE") return durationSec;
  const meta = await fetchYouTubeMeta(videoUrl);
  return meta?.durationSec ?? durationSec;
}

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
    const durationSec = await resolveDurationSec(
      parsed.data.videoUrl,
      parsed.data.durationSec,
    );
    await createLesson(actor.id, {
      courseId: parsed.data.courseId,
      title: parsed.data.title,
      description: parsed.data.description,
      videoUrl: parsed.data.videoUrl,
      durationSec,
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
    const durationSec = await resolveDurationSec(
      parsed.data.videoUrl,
      parsed.data.durationSec,
    );
    await updateLesson(actor.id, {
      id: parsed.data.id,
      courseId: parsed.data.courseId,
      title: parsed.data.title,
      description: parsed.data.description,
      videoUrl: parsed.data.videoUrl,
      durationSec,
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
    await deleteLesson(actor.id, { id: parsed.data.id, courseId: parsed.data.courseId });
    revalidatePath(`/admin/courses/${parsed.data.courseId}`);
    return ok(null);
  } catch (e) {
    if (e instanceof AppError) return err(e.code, e.message);
    return err("INTERNAL", "削除に失敗しました。");
  }
}

/**
 * フォーム action として直接バインドされる Server Action。
 * 成功時は redirect() で同一ページにリダイレクト (RSC が再実行され新レッスンが表示される)。
 * バリデーションエラー時はサーバーエラーを throw (ブラウザのエラーバウンダリで表示される)。
 */
export async function createLessonServerAction(formData: FormData) {
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
    throw new Error("入力値が不正です。");
  }

  const durationSec = await resolveDurationSec(
    parsed.data.videoUrl,
    parsed.data.durationSec,
  );
  await createLesson(actor.id, {
    courseId: parsed.data.courseId,
    title: parsed.data.title,
    description: parsed.data.description,
    videoUrl: parsed.data.videoUrl,
    durationSec,
    order: parsed.data.order,
    blockSeek: parsed.data.blockSeek === "on" || parsed.data.blockSeek === "true",
    requiredCompletionRate:
      parsed.data.requiredCompletionRate === "" ||
      parsed.data.requiredCompletionRate === undefined
        ? null
        : parsed.data.requiredCompletionRate,
  });

  revalidatePath(`/admin/courses/${parsed.data.courseId}`);
  redirect(`/admin/courses/${parsed.data.courseId}`);
}
