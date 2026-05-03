/**
 * GET /api/lessons/[lessonId]/video
 *
 * 認可付き動画ストリーミングエンドポイント (C-1 対策)。
 *
 * - requireUser() で認証済みユーザーのみアクセス可。
 * - ADMIN は Enrollment チェックを免除。
 * - STUDENT は prisma.enrollment で当該コースへの Enrollment を検証。
 * - videoUrl が /uploads/<key>.mp4 パターンの場合のみ .uploads/ からストリーム返送。
 * - YouTube / Blob URL は 404 (このエンドポイントはローカルファイル専用)。
 * - Range リクエスト (動画シーク) に対応。
 * - Cache-Control: private, no-store で CDN キャッシュを禁止。
 *
 * Phase E: Lesson は CmsPort 経由で取得する (Prisma の lesson テーブルは廃止)。
 */

import { NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import { err } from "@/lib/result";

/** /uploads/<key>.mp4 — key は英数字・ドット・ハイフン・アンダースコアのみ */
const RE_FILE_UPLOADS = /^\/uploads\/([\w.\-]+\.mp4)$/;

/** .uploads/ ディレクトリ (public 配下から移動済み) */
const UPLOADS_DIR = join(process.cwd(), ".uploads");

export async function GET(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  // 認証ガード
  let user;
  try {
    const { requireUser } = await import("@/server/auth");
    user = await requireUser();
  } catch {
    return NextResponse.json(
      err("UNAUTHENTICATED", "認証が必要です。"),
      { status: 401 },
    );
  }

  const { lessonId } = await params;

  // Lesson の取得 (courseId と videoUrl が必要) — CmsPort 経由
  const lesson = await container.cms.getLesson(lessonId);

  if (!lesson) {
    return NextResponse.json(err("NOT_FOUND", "レッスンが見つかりません。"), {
      status: 404,
    });
  }

  // このエンドポイントはローカルファイル (/uploads/<key>) 専用
  const match = RE_FILE_UPLOADS.exec(lesson.videoUrl);
  if (!match) {
    return NextResponse.json(
      err("NOT_FOUND", "このレッスンの動画はファイルストリームで提供されていません。"),
      { status: 404 },
    );
  }
  const key = match[1]!;

  // ADMIN はコースへの Enrollment チェック不要
  if (user.role !== "ADMIN") {
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: user.id, courseId: lesson.courseId },
      },
      select: { id: true },
    });
    if (!enrollment) {
      return NextResponse.json(
        err("FORBIDDEN", "このコースへの受講権限がありません。"),
        { status: 403 },
      );
    }
  }

  // ファイルパスをサニタイズ (key は RE_FILE_UPLOADS でフィルタ済み)
  const filePath = join(UPLOADS_DIR, key);

  // ファイル存在チェック
  let fileSize: number;
  try {
    const stat = statSync(filePath);
    fileSize = stat.size;
  } catch {
    return NextResponse.json(err("NOT_FOUND", "動画ファイルが見つかりません。"), {
      status: 404,
    });
  }

  // Range リクエスト処理 (動画シーク対応)
  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const rangeMatch = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end   = rangeMatch[2] ? Number(rangeMatch[2]) : fileSize - 1;

      if (start > end || start >= fileSize) {
        return new NextResponse(null, {
          status:  416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const chunkSize = end - start + 1;
      const stream    = createReadStream(filePath, { start, end });

      return new NextResponse(
        stream as unknown as ReadableStream,
        {
          status:  206,
          headers: {
            "Content-Type":   "video/mp4",
            "Content-Range":  `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": String(chunkSize),
            "Accept-Ranges":  "bytes",
            "Cache-Control":  "private, no-store",
          },
        },
      );
    }
  }

  // Range なし — ファイル全体を返す
  const stream = createReadStream(filePath);

  return new NextResponse(
    stream as unknown as ReadableStream,
    {
      status:  200,
      headers: {
        "Content-Type":   "video/mp4",
        "Content-Length": String(fileSize),
        "Accept-Ranges":  "bytes",
        "Cache-Control":  "private, no-store",
      },
    },
  );
}
