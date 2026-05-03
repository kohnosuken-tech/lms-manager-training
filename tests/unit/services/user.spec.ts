/**
 * bulkCreateUsers のユニットテスト
 *
 * CSV ヘッダ欠如 / 行数上限超過 / CONFLICT / role 異常値 を検証する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma, resetDb } from "../../helpers/db";
import { bulkCreateUsers } from "@/server/services/user";

vi.mock("@/server/container", () => ({
  container: {
    audit: { write: vi.fn().mockResolvedValue(undefined) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mail: { send: vi.fn().mockResolvedValue(undefined) },
  },
}));

const ACTOR_ID = "actor-admin-id";

async function createActor() {
  await testPrisma.user.create({
    data: { id: ACTOR_ID, email: "admin@example.com", name: "管理者", role: "ADMIN" },
  });
}

describe("bulkCreateUsers", () => {
  beforeEach(async () => {
    await resetDb();
    await createActor();
  });

  it("正常: email,name,role ヘッダ付き CSV で全行作成される", async () => {
    const csv = [
      "email,name,role",
      "alice@example.com,アリス,STUDENT",
      "bob@example.com,ボブ,ADMIN",
    ].join("\n");

    const result = await bulkCreateUsers(ACTOR_ID, csv);

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("ヘッダが `email,name,role` を含まない場合は VALIDATION_FAILED エラーが投げられる", async () => {
    const csv = ["id,name", "1,太郎"].join("\n");

    await expect(bulkCreateUsers(ACTOR_ID, csv)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("空 CSV を渡すと VALIDATION_FAILED エラーが投げられる", async () => {
    await expect(bulkCreateUsers(ACTOR_ID, "")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("201 行のデータ行 (ヘッダ除く) を渡すと 200 件上限を超えて VALIDATION_FAILED エラーが投げられる", async () => {
    const rows = ["email,name,role"];
    for (let i = 0; i < 201; i++) {
      rows.push(`user${i}@example.com,ユーザー${i},STUDENT`);
    }
    const csv = rows.join("\n");

    await expect(bulkCreateUsers(ACTOR_ID, csv)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("200 行のデータ行は上限内で全員作成される", async () => {
    const rows = ["email,name,role"];
    for (let i = 0; i < 200; i++) {
      rows.push(`user${i}@example.com,ユーザー${i},STUDENT`);
    }
    const csv = rows.join("\n");

    const result = await bulkCreateUsers(ACTOR_ID, csv);

    expect(result.created).toBe(200);
    expect(result.errors).toHaveLength(0);
  });

  it("既存メールアドレスは CONFLICT としてエラー行に記録され、作成はスキップされる", async () => {
    // 事前に同じメールを登録しておく
    await testPrisma.user.create({
      data: { email: "existing@example.com", name: "既存ユーザー", role: "STUDENT" },
    });

    const csv = [
      "email,name,role",
      "existing@example.com,重複ユーザー,STUDENT",
      "newuser@example.com,新規ユーザー,STUDENT",
    ].join("\n");

    const result = await bulkCreateUsers(ACTOR_ID, csv);

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(2);
    expect(result.errors[0].reason).toContain("既に登録");
  });

  it("role が STUDENT/ADMIN 以外の行はエラー行に記録されてスキップされる", async () => {
    const csv = [
      "email,name,role",
      "user1@example.com,ユーザー1,MANAGER",
      "user2@example.com,ユーザー2,STUDENT",
    ].join("\n");

    const result = await bulkCreateUsers(ACTOR_ID, csv);

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(2);
    expect(result.errors[0].reason).toContain("STUDENT/ADMIN");
  });

  it("email または name が空の行はエラー行に記録されてスキップされる", async () => {
    const csv = [
      "email,name,role",
      ",名前なし,STUDENT",
      "noemail@example.com,,STUDENT",
      "valid@example.com,有効ユーザー,STUDENT",
    ].join("\n");

    const result = await bulkCreateUsers(ACTOR_ID, csv);

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(2);
  });

  it("ヘッダ列の順序が違っても正しく処理される (name,email,role)", async () => {
    const csv = [
      "name,email,role",
      "太郎,taro@example.com,STUDENT",
    ].join("\n");

    const result = await bulkCreateUsers(ACTOR_ID, csv);

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("C-3: ダブルクォート内のカンマは分割されず正しくパースされる", async () => {
    // name フィールドに「山田, 太郎」のようにカンマを含む場合、
    // CSV インジェクション対策として csv-parse が正しく処理することを検証する
    const csv = [
      "email,name,role",
      '"quoted@example.com","山田, 太郎",STUDENT',
    ].join("\n");

    const result = await bulkCreateUsers(ACTOR_ID, csv);

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("C-3: 先頭が = の name を持つ CSV 行が正常に取り込まれる (インジェクション文字の無害化はエクスポート側で行う)", async () => {
    const csv = [
      "email,name,role",
      '"formula@example.com","=SUM(A1)",STUDENT',
    ].join("\n");

    const result = await bulkCreateUsers(ACTOR_ID, csv);

    // インポート自体はブロックしない (エクスポート時に無害化)
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });
});
