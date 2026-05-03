import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import { CourseMetaForm } from "./course-meta-form";
import { LessonsSection } from "./lessons-section";
import { EnrollmentSection } from "./enrollment-section";

export const metadata = { title: "コース編集 | LMS" };

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export default async function AdminCourseEditPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requireAdmin();
  const { courseId } = await params;

  const [course, lessons, enrollments] = await Promise.all([
    container.cms.getCourse(courseId),
    container.cms.listLessons(courseId),
    prisma.enrollment.findMany({
      where: { courseId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { assignedAt: "asc" },
    }),
  ]);
  if (!course) notFound();

  const enrolledIds = new Set(enrollments.map((e) => e.userId));
  const candidates = await prisma.user.findMany({
    where: { deactivated: false, id: { notIn: [...enrolledIds] } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{course.title}</h1>
          <p className="text-sm text-muted-foreground">コースの編集</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/courses">← 一覧へ戻る</Link>
        </Button>
      </div>

      <CourseMetaForm
        course={{
          id: course.id,
          title: course.title,
          description: course.description,
          order: course.order,
          published: course.published,
        }}
      />

      <LessonsSection
        courseId={course.id}
        lessons={lessons.map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description,
          videoUrl: l.videoUrl,
          durationSec: l.durationSec ?? 0,
          order: l.order,
          blockSeek: l.blockSeek,
          requiredCompletionRate: l.requiredCompletionRate,
        }))}
      />

      <EnrollmentSection
        courseId={course.id}
        enrolled={enrollments.map((e) => ({
          userId: e.userId,
          email: e.user.email,
          name: e.user.name,
          assignedAt: fmtDate(e.assignedAt) ?? "",
          dueAt: fmtDate(e.dueAt),
          completedAt: fmtDate(e.completedAt),
        }))}
        candidates={candidates}
      />
    </div>
  );
}
