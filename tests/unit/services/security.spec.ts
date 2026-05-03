/**
 * セキュリティ修正 (H-2, H-4, H-5) および クエリ拡張 (U-3) のユニットテスト
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma, resetDb } from "../../helpers/db";
import {
  createUser,
  deactivateUser,
  changeRole,
  listUsers,
} from "@/server/services/user";
import {
  createLesson,
  updateLesson,
  deleteLesson,
  createCourse,
  listCourses,
} from "@/server/services/course";
import {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  createTest,
} from "@/server/services/test-admin";
import { listAuditLogs } from "@/server/services/audit";
import { AppError } from "@/lib/errors";

vi.mock("@/server/container", () => ({
  container: {
    audit: { write: vi.fn().mockResolvedValue(undefined) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mail: { send: vi.fn().mockResolvedValue(undefined) },
  },
}));

const ACTOR_ID = "actor-admin-id";

async function createActor() {
  return testPrisma.user.create({
    data: { id: ACTOR_ID, email: "admin@example.com", name: "管理者", role: "ADMIN" },
  });
}

// ---------- H-2: sessionVersion ----------

describe("H-2: sessionVersion", () => {
  beforeEach(async () => {
    await resetDb();
    await createActor();
  });

  it("deactivateUser(deactivated=true) で sessionVersion がインクリメントされる", async () => {
    const targetId = "target-user-id";
    await testPrisma.user.create({
      data: { id: targetId, email: "target@example.com", name: "対象", role: "STUDENT" },
    });

    const before = await testPrisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: { sessionVersion: true },
    });

    await deactivateUser(ACTOR_ID, targetId, true);

    const after = await testPrisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: { sessionVersion: true },
    });

    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
  });

  it("deactivateUser(deactivated=false) では sessionVersion はインクリメントされない", async () => {
    const targetId = "target-user-id-2";
    await testPrisma.user.create({
      data: {
        id: targetId,
        email: "target2@example.com",
        name: "対象2",
        role: "STUDENT",
        deactivated: true,
        sessionVersion: 3,
      },
    });

    await deactivateUser(ACTOR_ID, targetId, false);

    const after = await testPrisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: { sessionVersion: true },
    });

    // 再有効化時はインクリメントしない (既存 JWT はいずれにせよ無効化済み)
    expect(after.sessionVersion).toBe(3);
  });

  it("changeRole で sessionVersion がインクリメントされる", async () => {
    const targetId = "target-user-id-3";
    await testPrisma.user.create({
      data: { id: targetId, email: "target3@example.com", name: "対象3", role: "STUDENT" },
    });

    const before = await testPrisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: { sessionVersion: true },
    });

    await changeRole(ACTOR_ID, targetId, "ADMIN");

    const after = await testPrisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: { sessionVersion: true },
    });

    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
  });

  it("新規作成ユーザーの sessionVersion は 1 になる", async () => {
    await createUser(ACTOR_ID, {
      email: "newuser@example.com",
      name: "新規ユーザー",
      role: "STUDENT",
    });

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { email: "newuser@example.com" },
      select: { sessionVersion: true },
    });

    expect(user.sessionVersion).toBe(1);
  });
});

// ---------- H-4: 監査ログ PII 除外 ----------

describe("H-4: 監査ログ PII 除外", () => {
  let auditWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetDb();
    await createActor();

    const { container } = await import("@/server/container");
    auditWriteMock = container.audit.write as ReturnType<typeof vi.fn>;
    auditWriteMock.mockClear();
  });

  it("createUser の audit diff に email / name が含まれない", async () => {
    await createUser(ACTOR_ID, {
      email: "pii-test@example.com",
      name: "PII テスト",
      role: "STUDENT",
    });

    expect(auditWriteMock).toHaveBeenCalledOnce();
    const call = auditWriteMock.mock.calls[0][0];
    expect(call.action).toBe("USER_CREATE");
    expect(call.diff).not.toHaveProperty("email");
    expect(call.diff).not.toHaveProperty("name");
    expect(call.diff).toHaveProperty("userId");
  });

  it("deactivateUser の audit diff に email / name が含まれない", async () => {
    const targetId = "h4-target-id";
    await testPrisma.user.create({
      data: { id: targetId, email: "h4-target@example.com", name: "H4 対象", role: "STUDENT" },
    });

    await deactivateUser(ACTOR_ID, targetId, true);

    expect(auditWriteMock).toHaveBeenCalledOnce();
    const call = auditWriteMock.mock.calls[0][0];
    expect(call.action).toBe("USER_DEACTIVATE");
    expect(call.diff).not.toHaveProperty("email");
    expect(call.diff).not.toHaveProperty("name");
    expect(call.diff).toHaveProperty("userId");
  });

  it("changeRole の audit diff に email / name が含まれない", async () => {
    const targetId = "h4-role-target-id";
    await testPrisma.user.create({
      data: { id: targetId, email: "h4-role@example.com", name: "H4 ロール対象", role: "STUDENT" },
    });

    await changeRole(ACTOR_ID, targetId, "ADMIN");

    expect(auditWriteMock).toHaveBeenCalledOnce();
    const call = auditWriteMock.mock.calls[0][0];
    expect(call.action).toBe("ROLE_CHANGE");
    expect(call.diff).not.toHaveProperty("email");
    expect(call.diff).not.toHaveProperty("name");
    expect(call.diff).toHaveProperty("userId");
  });
});

// ---------- H-5: courseId / testId 整合検証 ----------

describe("H-5: courseId 整合検証 (updateLesson / deleteLesson)", () => {
  beforeEach(async () => {
    await resetDb();
    await createActor();
  });

  async function createCourseAndLesson() {
    const courseA = await testPrisma.course.create({
      data: { title: "コース A", description: "", order: 0 },
    });
    const courseB = await testPrisma.course.create({
      data: { title: "コース B", description: "", order: 1 },
    });
    const lesson = await testPrisma.lesson.create({
      data: {
        courseId: courseA.id,
        title: "テストレッスン",
        videoUrl: "/sample.mp4",
        durationSec: 60,
        order: 0,
      },
    });
    return { courseA, courseB, lesson };
  }

  it("updateLesson: 正しい courseId では更新できる", async () => {
    const { courseA, lesson } = await createCourseAndLesson();

    await expect(
      updateLesson(ACTOR_ID, {
        id: lesson.id,
        courseId: courseA.id,
        title: "更新後タイトル",
      }),
    ).resolves.not.toThrow();
  });

  it("updateLesson: 異なる courseId では NOT_FOUND エラーになる", async () => {
    const { courseB, lesson } = await createCourseAndLesson();

    await expect(
      updateLesson(ACTOR_ID, {
        id: lesson.id,
        courseId: courseB.id, // lesson は courseA に属するが courseB を指定
        title: "不正更新",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleteLesson: 正しい courseId では削除できる", async () => {
    const { courseA, lesson } = await createCourseAndLesson();

    await expect(
      deleteLesson(ACTOR_ID, { id: lesson.id, courseId: courseA.id }),
    ).resolves.not.toThrow();
  });

  it("deleteLesson: 異なる courseId では NOT_FOUND エラーになる", async () => {
    const { courseB, lesson } = await createCourseAndLesson();

    await expect(
      deleteLesson(ACTOR_ID, { id: lesson.id, courseId: courseB.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("H-5: testId 整合検証 (updateQuestion / deleteQuestion)", () => {
  beforeEach(async () => {
    await resetDb();
    await createActor();
  });

  async function createTestAndQuestion() {
    const course = await testPrisma.course.create({
      data: { title: "テスト用コース", description: "", order: 0 },
    });
    const testA = await testPrisma.test.create({
      data: { courseId: course.id, title: "テスト A", passingScore: 70, maxAttempts: 3 },
    });
    const testB = await testPrisma.test.create({
      data: { courseId: course.id, title: "テスト B", passingScore: 70, maxAttempts: 3 },
    });
    const question = await testPrisma.question.create({
      data: {
        testId: testA.id,
        type: "SINGLE",
        prompt: "テスト設問",
        explanation: "",
        order: 0,
      },
    });
    // 選択肢追加
    await testPrisma.choice.createMany({
      data: [
        { questionId: question.id, label: "選択肢 A", correct: true, order: 0 },
        { questionId: question.id, label: "選択肢 B", correct: false, order: 1 },
      ],
    });
    return { testA, testB, question };
  }

  it("updateQuestion: 正しい testId では更新できる", async () => {
    const { testA, question } = await createTestAndQuestion();

    await expect(
      updateQuestion(ACTOR_ID, {
        id: question.id,
        testId: testA.id,
        type: "SINGLE",
        prompt: "更新後設問",
        explanation: "",
        choices: [
          { label: "選択肢 A", correct: true },
          { label: "選択肢 B", correct: false },
        ],
      }),
    ).resolves.not.toThrow();
  });

  it("updateQuestion: 異なる testId では NOT_FOUND エラーになる", async () => {
    const { testB, question } = await createTestAndQuestion();

    await expect(
      updateQuestion(ACTOR_ID, {
        id: question.id,
        testId: testB.id, // question は testA に属するが testB を指定
        type: "SINGLE",
        prompt: "不正更新",
        explanation: "",
        choices: [
          { label: "選択肢 A", correct: true },
          { label: "選択肢 B", correct: false },
        ],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleteQuestion: 正しい testId では削除できる", async () => {
    const { testA, question } = await createTestAndQuestion();

    await expect(
      deleteQuestion(ACTOR_ID, { id: question.id, testId: testA.id }),
    ).resolves.not.toThrow();
  });

  it("deleteQuestion: 異なる testId では NOT_FOUND エラーになる", async () => {
    const { testB, question } = await createTestAndQuestion();

    await expect(
      deleteQuestion(ACTOR_ID, { id: question.id, testId: testB.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ---------- クエリ拡張 (U-3) ----------

describe("listUsers: フィルタ / ページネーション", () => {
  beforeEach(async () => {
    await resetDb();
    await createActor();
    // テストデータ
    await testPrisma.user.createMany({
      data: [
        { email: "alice@example.com", name: "アリス", role: "STUDENT" },
        { email: "bob@example.com", name: "ボブ", role: "ADMIN" },
        { email: "carol@example.com", name: "キャロル", role: "STUDENT", deactivated: true },
      ],
    });
  });

  it("フィルタなし: 全件返る (admin を含む)", async () => {
    const result = await listUsers();
    // ACTOR_ID の admin + 3 件 = 4 件
    expect(result.items.length).toBeGreaterThanOrEqual(3);
  });

  it("role=ADMIN フィルタ", async () => {
    const result = await listUsers({ role: "ADMIN" });
    expect(result.items.every((u) => u.role === "ADMIN")).toBe(true);
  });

  it("deactivated=true フィルタ", async () => {
    const result = await listUsers({ deactivated: true });
    expect(result.items.every((u) => u.deactivated)).toBe(true);
    expect(result.items.length).toBe(1);
  });

  it("q で email 部分一致", async () => {
    const result = await listUsers({ q: "alice" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe("alice@example.com");
  });

  it("q で name 部分一致", async () => {
    const result = await listUsers({ q: "ボブ" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("ボブ");
  });

  it("take でページサイズを制限し nextCursor が返る", async () => {
    const result = await listUsers({ take: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();

    // 2 ページ目
    const second = await listUsers({ take: 2, cursor: result.nextCursor! });
    const firstIds = new Set(result.items.map((u) => u.id));
    for (const u of second.items) {
      expect(firstIds.has(u.id)).toBe(false);
    }
  });
});

describe("listCourses: フィルタ", () => {
  beforeEach(async () => {
    await resetDb();
    await createActor();
    await testPrisma.course.createMany({
      data: [
        { title: "Next.js 入門", description: "", order: 0, published: true },
        { title: "TypeScript 基礎", description: "", order: 1, published: false },
        { title: "Next.js 応用", description: "", order: 2, published: true },
      ],
    });
  });

  it("フィルタなし: 全件返る", async () => {
    const result = await listCourses();
    expect(result).toHaveLength(3);
  });

  it("published=true フィルタ", async () => {
    const result = await listCourses({ published: true });
    expect(result.every((c) => c.published)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("q でタイトル部分一致", async () => {
    const result = await listCourses({ q: "Next.js" });
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.title.includes("Next.js"))).toBe(true);
  });

  it("q + published の複合フィルタ", async () => {
    const result = await listCourses({ q: "Next.js", published: true });
    expect(result).toHaveLength(2);
  });
});

describe("listAuditLogs: 拡張フィルタ", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("actor フィルタ: actorId 一致", async () => {
    const user1 = await testPrisma.user.create({
      data: { email: "actor1@example.com", name: "アクター1", role: "ADMIN" },
    });
    const user2 = await testPrisma.user.create({
      data: { email: "actor2@example.com", name: "アクター2", role: "ADMIN" },
    });
    await testPrisma.auditLog.createMany({
      data: [
        { actorId: user1.id, action: "USER_LOGIN", diff: "" },
        { actorId: user2.id, action: "USER_LOGIN", diff: "" },
        { actorId: user1.id, action: "USER_CREATE", diff: "" },
      ],
    });

    const result = await listAuditLogs({ actor: user1.id });
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.actor?.id === user1.id)).toBe(true);
  });

  it("from/to 範囲フィルタ", async () => {
    const user = await testPrisma.user.create({
      data: { email: "range@example.com", name: "範囲テスト", role: "ADMIN" },
    });
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-02-01T00:00:00Z");
    const t3 = new Date("2026-03-01T00:00:00Z");

    await testPrisma.auditLog.createMany({
      data: [
        { actorId: user.id, action: "USER_LOGIN", diff: "", at: t1 },
        { actorId: user.id, action: "USER_LOGIN", diff: "", at: t2 },
        { actorId: user.id, action: "USER_LOGIN", diff: "", at: t3 },
      ],
    });

    const result = await listAuditLogs({
      from: new Date("2026-01-15T00:00:00Z"),
      to: new Date("2026-02-15T00:00:00Z"),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].at).toEqual(t2);
  });

  it("action + actor の複合フィルタ", async () => {
    const user1 = await testPrisma.user.create({
      data: { email: "combo1@example.com", name: "コンボ1", role: "ADMIN" },
    });
    const user2 = await testPrisma.user.create({
      data: { email: "combo2@example.com", name: "コンボ2", role: "ADMIN" },
    });
    await testPrisma.auditLog.createMany({
      data: [
        { actorId: user1.id, action: "USER_LOGIN", diff: "" },
        { actorId: user2.id, action: "USER_LOGIN", diff: "" },
        { actorId: user1.id, action: "USER_CREATE", diff: "" },
      ],
    });

    const result = await listAuditLogs({ action: "USER_LOGIN", actor: user1.id });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].action).toBe("USER_LOGIN");
    expect(result.items[0].actor?.id).toBe(user1.id);
  });
});
