import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import { ok, err } from "@/lib/result";
import { maskEmail } from "@/lib/mask";

/** タイミング攻撃を防ぐ文字列比較 (長さが異なれば即 false) */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// 7 日前ウィンドウ: ±12h (日次 cron を想定した重複送信回避)
const DAYS_BEFORE = 7;
const WINDOW_H = 12;

export async function POST(req: Request) {
  // H-3: Bearer token 認可 (主な検証は middleware で実施済み。ここは二重防御)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // H-3: secret 未設定時は汎用メッセージのみ (詳細は logger に出力)
    container.logger.warn("cron.reminders.secret_missing", {});
    return NextResponse.json(
      err("UNAUTHENTICATED", "Unauthorized"),
      { status: 401 },
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!safeEqual(token, cronSecret)) {
    container.logger.warn("cron.reminders.unauthorized", {});
    return NextResponse.json(
      err("UNAUTHENTICATED", "Unauthorized"),
      { status: 401 },
    );
  }

  const now = new Date();
  const windowMs = WINDOW_H * 60 * 60 * 1000;
  const targetMs = DAYS_BEFORE * 24 * 60 * 60 * 1000;

  // 7 日後 ±12h の dueAt を持つ、未完了の Enrollment
  const dueFrom = new Date(now.getTime() + targetMs - windowMs);
  const dueTo   = new Date(now.getTime() + targetMs + windowMs);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      dueAt:       { gte: dueFrom, lt: dueTo },
      completedAt: null,
    },
    select: {
      id:       true,
      dueAt:    true,
      courseId: true,
      user:     { select: { email: true, name: true } },
    },
  });

  // Course タイトルを CmsPort 経由で一括取得
  const allCourses = await container.cms.listCourses();
  const courseMap = new Map(allCourses.map((c) => [c.id, c.title]));

  let sent = 0;
  for (const enrollment of enrollments) {
    const dueLabel    = enrollment.dueAt
      ? enrollment.dueAt.toISOString().slice(0, 10)
      : "";
    const courseTitle = courseMap.get(enrollment.courseId) ?? enrollment.courseId;
    try {
      await container.mail.send(
        enrollment.user.email,
        `[LMS] 「${courseTitle}」の期限が 7 日後です`,
        `${enrollment.user.name} さん、\n\n研修コース「${courseTitle}」の期限 (${dueLabel}) まで 7 日を切りました。\nまだ未完了の場合は期限内に受講を完了してください。`,
      );
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown";
      // L-4: メールアドレスをマスクしてログに記録する (PII 漏洩防止)
      container.logger.error("cron.reminders.mail_failed", {
        enrollmentId: enrollment.id,
        email:        maskEmail(enrollment.user.email),
        message,
      });
    }
  }

  container.logger.info("cron.reminders.done", { sent, total: enrollments.length });
  return NextResponse.json(ok({ sent }));
}
