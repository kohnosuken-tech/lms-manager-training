/**
 * セキュリティ修正 (H-2, H-4, H-5) および クエリ拡張 (U-3) のユニットテスト
 *
 * Phase E 対応:
 * - H-5: Course / Lesson / Test / Question / Choice は Prisma から削除済み。
 *   createLesson / updateLesson / deleteLesson / createTest / addQuestion /
 *   updateQuestion / deleteQuestion はすべて WRITE_NOT_SUPPORTED を返す。
 *   それを確認するテストに置き換える。
 * - listCourses: CmsPort モックを使う。
 * - sqliteCms → localCms に変更。
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
  listCourses,
} from "@/server/services/course";
import {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  createTest,
} from "@/server/services/test-admin";
import { listAuditLogs } from "@/server/services/audit";
import { localCms } from "@/server/adapters/local/cms";
import type { CmsPort, Course } from "@/server/ports/cms";

vi.mock("@/server/container", () => ({
  container: {
    audit:  { write: vi.fn().mockResolvedValue(undefined) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mail:   { send: vi.fn().mockResolvedValue(undefined) },
    get cms() {
      return localCms;
    },
  },
}));

const ACTOR_ID = "actor-admin-id";

async function createActor() {
  return testPrisma.user.create({
    data: { id: ACTOR_ID, email: "admin@example.com", name: "管理者", role: "ADMIN" },
  });
}

// ---------- CmsPort モックファクトリ (listCourses テスト用) ----------

const now = new Date().toISOString();

function makeMockCms(courses: Course[]): CmsPort {
  return {
    listCourses:   vi.fn().mockResolvedValue(courses),
    listLessons:   vi.fn().mockResolvedValue([]),
    listTests:     vi.fn().mockResolvedValue([]),
    listQuestions: vi.fn().mockResolvedValue([]),
    listChoices:   vi.fn().mockResolvedValue([]),
    getCourse:     vi.fn().mockImplementation((id: string) =>
      Promise.resolve(courses.find((c) => c.id === id) ?? null),
    ),
    getLesson:     vi.fn().mockResolvedValue(null),
    getTest:       vi.fn().mockResolvedValue(null),
    getQuestion:   vi.fn().mockResolvedValue(null),
  };
}

function makeCourse(overrides: Partial<Course> & { id: string; title: string }): Course {
  return {
    description: "",
    order:       0,
    published:   true,
    createdAt:   now,
    updatedAt:   now,
    ...overrides,
  };
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
        id:             targetId,
        email:          "target2@example.com",
        name:           "対象2",
        role:           "STUDENT",
        deactivated:    true,
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
      name:  "新規ユーザー",
      role:  "STUDENT",
    });

    const user = await testPrisma.user.findUniqueOrThrow({
      where:  { email: "newuser@example.com" },
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
      name:  "PII テスト",
      role:  "STUDENT",
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

// ---------- H-5: Phase E では write 操作はすべて WRITE_NOT_SUPPORTED ----------

describe("H-5: write 操作は WRITE_NOT_SUPPORTED (Phase E)", () => {
  beforeEach(async () => {
    await resetDb();
    await createActor();
  });

  it("createLesson が WRITE_NOT_SUPPORTED エラーを返す", async () => {
    await expect(
      createLesson(ACTOR_ID, {
        courseId:    "any-course",
        title:       "テストレッスン",
        durationSec: 60,
        order:       0,
      }),
    ).rejects.toMatchObject({ code: "WRITE_NOT_SUPPORTED" });
  });

  it("updateLesson が WRITE_NOT_SUPPORTED エラーを返す", async () => {
    await expect(
      updateLesson(ACTOR_ID, {
        id:       "any-lesson",
        courseId: "any-course",
        title:    "更新後タイトル",
      }),
    ).rejects.toMatchObject({ code: "WRITE_NOT_SUPPORTED" });
  });

  it("deleteLesson が WRITE_NOT_SUPPORTED エラーを返す", async () => {
    await expect(
      deleteLesson(ACTOR_ID, { id: "any-lesson", courseId: "any-course" }),
    ).rejects.toMatchObject({ code: "WRITE_NOT_SUPPORTED" });
  });

  it("createTest が WRITE_NOT_SUPPORTED エラーを返す", async () => {
    await expect(
      createTest(ACTOR_ID, {
        courseId:     "any-course",
        title:        "テスト",
        passingScore: 70,
        maxAttempts:  3,
      }),
    ).rejects.toMatchObject({ code: "WRITE_NOT_SUPPORTED" });
  });

  it("addQuestion が WRITE_NOT_SUPPORTED エラーを返す", async () => {
    await expect(
      addQuestion(ACTOR_ID, {
        testId:      "any-test",
        type:        "SINGLE",
        prompt:      "設問文",
        explanation: "",
        choices:     [
          { label: "A", correct: true },
          { label: "B", correct: false },
        ],
      }),
    ).rejects.toMatchObject({ code: "WRITE_NOT_SUPPORTED" });
  });

  it("updateQuestion が WRITE_NOT_SUPPORTED エラーを返す", async () => {
    await expect(
      updateQuestion(ACTOR_ID, {
        id:          "any-question",
        testId:      "any-test",
        type:        "SINGLE",
        prompt:      "更新後設問",
        explanation: "",
        choices:     [
          { label: "A", correct: true },
          { label: "B", correct: false },
        ],
      }),
    ).rejects.toMatchObject({ code: "WRITE_NOT_SUPPORTED" });
  });

  it("deleteQuestion が WRITE_NOT_SUPPORTED エラーを返す", async () => {
    await expect(
      deleteQuestion(ACTOR_ID, { id: "any-question", testId: "any-test" }),
    ).rejects.toMatchObject({ code: "WRITE_NOT_SUPPORTED" });
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
        { email: "alice@example.com", name: "アリス",   role: "STUDENT" },
        { email: "bob@example.com",   name: "ボブ",     role: "ADMIN" },
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
    expect(result.items[0]!.email).toBe("alice@example.com");
  });

  it("q で name 部分一致", async () => {
    const result = await listUsers({ q: "ボブ" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("ボブ");
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

describe("listCourses: フィルタ (CmsPort モック)", () => {
  beforeEach(async () => {
    await resetDb();
    await createActor();
  });

  it("フィルタなし: 全件返る", async () => {
    const cms = makeMockCms([
      makeCourse({ id: "c1", title: "Next.js 入門",    order: 0, published: true }),
      makeCourse({ id: "c2", title: "TypeScript 基礎", order: 1, published: false }),
      makeCourse({ id: "c3", title: "Next.js 応用",    order: 2, published: true }),
    ]);
    const result = await listCourses({}, cms);
    expect(result).toHaveLength(3);
  });

  it("published=true フィルタ", async () => {
    const cms = makeMockCms([
      makeCourse({ id: "c1", title: "Next.js 入門",    order: 0, published: true }),
      makeCourse({ id: "c2", title: "TypeScript 基礎", order: 1, published: false }),
      makeCourse({ id: "c3", title: "Next.js 応用",    order: 2, published: true }),
    ]);
    const result = await listCourses({ published: true }, cms);
    expect(result.every((c) => c.published)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("q でタイトル部分一致", async () => {
    const cms = makeMockCms([
      makeCourse({ id: "c1", title: "Next.js 入門",    order: 0 }),
      makeCourse({ id: "c2", title: "TypeScript 基礎", order: 1 }),
      makeCourse({ id: "c3", title: "Next.js 応用",    order: 2 }),
    ]);
    const result = await listCourses({ q: "Next.js" }, cms);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.title.includes("Next.js"))).toBe(true);
  });

  it("q + published の複合フィルタ", async () => {
    const cms = makeMockCms([
      makeCourse({ id: "c1", title: "Next.js 入門",    order: 0, published: true }),
      makeCourse({ id: "c2", title: "TypeScript 基礎", order: 1, published: false }),
      makeCourse({ id: "c3", title: "Next.js 応用",    order: 2, published: true }),
    ]);
    const result = await listCourses({ q: "Next.js", published: true }, cms);
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
        { actorId: user1.id, action: "USER_LOGIN",  diff: "" },
        { actorId: user2.id, action: "USER_LOGIN",  diff: "" },
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
      to:   new Date("2026-02-15T00:00:00Z"),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.at).toEqual(t2);
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
        { actorId: user1.id, action: "USER_LOGIN",  diff: "" },
        { actorId: user2.id, action: "USER_LOGIN",  diff: "" },
        { actorId: user1.id, action: "USER_CREATE", diff: "" },
      ],
    });

    const result = await listAuditLogs({ action: "USER_LOGIN", actor: user1.id });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.action).toBe("USER_LOGIN");
    expect(result.items[0]!.actor?.id).toBe(user1.id);
  });
});
