/**
 * upsertProgress の requiredCompletionRate 境界値テスト
 *
 * デフォルト 0.95 / カスタム値でのエッジケースを検証する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma, resetDb } from "../../helpers/db";
import { upsertProgress } from "@/server/services/progress";

import { sqliteCms } from "@/server/adapters/sqlite/cms";

vi.mock("@/server/container", () => ({
  container: {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    get cms() {
      return sqliteCms;
    },
  },
}));

async function setupLesson(opts: {
  durationSec: number;
  requiredCompletionRate?: number | null;
}): Promise<{ userId: string; lessonId: string }> {
  const user = await testPrisma.user.create({
    data: { email: "progress-user@example.com", name: "進捗ユーザー", role: "STUDENT" },
    select: { id: true },
  });

  const course = await testPrisma.course.create({
    data: { title: "進捗コース", description: "", order: 0 },
    select: { id: true },
  });

  const lesson = await testPrisma.lesson.create({
    data: {
      courseId: course.id,
      title: "テストレッスン",
      videoUrl: "/sample.mp4",
      durationSec: opts.durationSec,
      order: 0,
      requiredCompletionRate: opts.requiredCompletionRate ?? null,
    },
    select: { id: true },
  });

  return { userId: user.id, lessonId: lesson.id };
}

describe("upsertProgress — requiredCompletionRate 境界値", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("デフォルト 0.95: watchedSec が durationSec の 95% ちょうどで completed=true になる", async () => {
    const { userId, lessonId } = await setupLesson({ durationSec: 100 });

    const result = await upsertProgress(userId, lessonId, 95, 95);

    expect(result.completed).toBe(true);
  });

  it("デフォルト 0.95: 94% では completed=false になる", async () => {
    const { userId, lessonId } = await setupLesson({ durationSec: 100 });

    const result = await upsertProgress(userId, lessonId, 94, 94);

    expect(result.completed).toBe(false);
  });

  it("カスタム 0.5: watchedSec が durationSec の 50% ちょうどで completed=true になる", async () => {
    const { userId, lessonId } = await setupLesson({
      durationSec: 200,
      requiredCompletionRate: 0.5,
    });

    const result = await upsertProgress(userId, lessonId, 100, 100);

    expect(result.completed).toBe(true);
  });

  it("カスタム 0.5: 49% では completed=false になる", async () => {
    const { userId, lessonId } = await setupLesson({
      durationSec: 200,
      requiredCompletionRate: 0.5,
    });

    const result = await upsertProgress(userId, lessonId, 98, 98);

    expect(result.completed).toBe(false);
  });

  it("一度 completed=true になった後、watchedSec を後退させても completed=true を維持する", async () => {
    const { userId, lessonId } = await setupLesson({ durationSec: 100 });

    // 最初に 95 秒視聴して完了させる
    await upsertProgress(userId, lessonId, 95, 95);

    // 次回はより小さい値で更新を試みる (watchedSec は単調増加なので更新されない)
    const result = await upsertProgress(userId, lessonId, 10, 10);

    expect(result.completed).toBe(true);
  });

  it("watchedSec が 0 のとき completed=false になる", async () => {
    const { userId, lessonId } = await setupLesson({ durationSec: 100 });

    const result = await upsertProgress(userId, lessonId, 0, 0);

    expect(result.completed).toBe(false);
  });

  it("durationSec=0 のレッスンでは completed=false になる (ゼロ除算回避)", async () => {
    const { userId, lessonId } = await setupLesson({ durationSec: 0 });

    const result = await upsertProgress(userId, lessonId, 0, 0);

    expect(result.completed).toBe(false);
  });

  it("watchedSec は単調増加: 後退値は無視されて既存の大きい値が維持される", async () => {
    const { userId, lessonId } = await setupLesson({ durationSec: 100 });

    await upsertProgress(userId, lessonId, 80, 80);
    await upsertProgress(userId, lessonId, 30, 30); // 後退: 無視されるはず

    const progress = await testPrisma.progress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { watchedSec: true },
    });

    expect(progress?.watchedSec).toBe(80);
  });
});
