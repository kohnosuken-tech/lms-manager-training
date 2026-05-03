/**
 * prisma/seed.ts — Phase E 更新版
 *
 * Course / Lesson / Test / Question / Choice は CmsPort (TSV fixture) が
 * 唯一のデータソースとなったため、seed から削除。
 *
 * User / Enrollment / Progress / Submission のみを seed する。
 * Enrollment / Progress は TSV fixture の固定 Course / Lesson ID を参照する。
 */

import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PROD_SEED) {
  throw new Error("seed forbidden in production");
}

const prisma = new PrismaClient();

// TSV fixture (gas/seed-data/*.tsv) と同じ固定 ID
const COURSE1_ID = "cmok8uvm70004v0z3n995yb4l"; // ハラスメント基礎研修
const COURSE2_ID = "cmok8uvmh000vv0z390kni3pt"; // 情報セキュリティ研修

// Course1 の最初のレッスン ID
const LESSON1_ID = "cmok8uvm80006v0z3rpwj1fkd"; // 第1回: ハラスメントとは

async function reset() {
  // 依存関係順に削除 (FK on cascade があるが冪等性のため明示)
  await prisma.answer.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.progress.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await reset();

  const admin = await prisma.user.create({
    data: {
      email: "admin@example.com",
      name: "管理 太郎",
      role: "ADMIN",
    },
  });

  const students = await Promise.all(
    [
      { email: "student1@example.com", name: "受講 一郎" },
      { email: "student2@example.com", name: "受講 二郎" },
      { email: "student3@example.com", name: "受講 三郎" },
    ].map((s) =>
      prisma.user.create({
        data: { email: s.email, name: s.name, role: "STUDENT" },
      }),
    ),
  );

  // Enrollment: 全 student を Course1、student1 のみ Course2 にも
  for (const s of students) {
    await prisma.enrollment.create({
      data: { userId: s.id, courseId: COURSE1_ID },
    });
  }
  await prisma.enrollment.create({
    data: { userId: students[0]!.id, courseId: COURSE2_ID },
  });

  // Progress: student1 の Course1 最初の Lesson を completed
  await prisma.progress.create({
    data: {
      userId: students[0]!.id,
      lessonId: LESSON1_ID,
      watchedSec: 276,
      lastPositionSec: 276,
      completed: true,
      completedAt: new Date(),
    },
  });

  // eslint-disable-next-line no-console
  console.log("[seed] done", {
    admin: admin.email,
    students: students.map((s) => s.email),
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
