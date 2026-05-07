/**
 * setup-notion.ts — Notion 上に 11 個の DB を自動生成する CLI
 *
 * 使い方:
 *   pnpm exec tsx --env-file=.env.local scripts/setup-notion.ts
 *
 * 必須 env:
 *   NOTION_TOKEN         — Internal Integration Secret (secret_xxx)
 *   NOTION_PARENT_PAGE_ID — DB をぶら下げる親ページの ID
 *
 * 動作:
 *   1. NOTION_TOKEN で client を作成
 *   2. 親ページにアクセスできるか確認
 *   3. 11 個の DB を親ページ配下に作成 (dataSources.create API)
 *   4. 各 DB の ID を NOTION_DB_XXX=xxx の形式でターミナルに出力
 *
 * 既に同名 DB がある場合: skip + 警告ログ
 * レート制限: 3 req/s (token bucket)
 */

import { Client } from "@notionhq/client";
import { TokenBucket } from "../src/server/adapters/notion/rate-limiter";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;

if (!NOTION_TOKEN) {
  process.stderr.write(
    "ERROR: NOTION_TOKEN が設定されていません。\n" +
      "pnpm exec tsx --env-file=.env.local scripts/setup-notion.ts のように --env-file を指定してください。\n",
  );
  process.exit(1);
}

if (!NOTION_PARENT_PAGE_ID) {
  process.stderr.write(
    "ERROR: NOTION_PARENT_PAGE_ID が設定されていません。\n" +
      ".env.local に NOTION_PARENT_PAGE_ID=<32桁のページID> を追加してください。\n",
  );
  process.exit(1);
}

const client = new Client({ auth: NOTION_TOKEN });
const limiter = new TokenBucket(5, 3, 30_000);

async function throttledRequest<T>(fn: () => Promise<T>): Promise<T> {
  await limiter.acquire();
  return fn();
}

// ---------- DB 定義 ----------

type PropertyDef =
  | { type: "title" }
  | { type: "rich_text" }
  | { type: "number" }
  | { type: "checkbox" }
  | { type: "date" }
  | { type: "email" }
  | { type: "url" }
  | { type: "select"; options: string[] };

type DbDef = {
  /** env 変数名 (NOTION_DB_ 以降) */
  envKey: string;
  /** Notion 上の DB 名 */
  title: string;
  /** properties */
  properties: Record<string, PropertyDef>;
};

const DB_DEFS: DbDef[] = [
  // ----- CMS 系 -----
  {
    envKey: "COURSE",
    title: "Course",
    properties: {
      name:        { type: "title" },
      id:          { type: "rich_text" },
      description: { type: "rich_text" },
      order:       { type: "number" },
      published:   { type: "checkbox" },
      createdAt:   { type: "date" },
      updatedAt:   { type: "date" },
    },
  },
  {
    envKey: "LESSON",
    title: "Lesson",
    properties: {
      name:                   { type: "title" },
      id:                     { type: "rich_text" },
      courseId:               { type: "rich_text" },
      description:            { type: "rich_text" },
      videoUrl:               { type: "url" },
      durationSec:            { type: "number" },
      order:                  { type: "number" },
      blockSeek:              { type: "checkbox" },
      requiredCompletionRate: { type: "number" },
      createdAt:              { type: "date" },
      updatedAt:              { type: "date" },
    },
  },
  {
    envKey: "TEST",
    title: "Test",
    properties: {
      name:                 { type: "title" },
      id:                   { type: "rich_text" },
      courseId:             { type: "rich_text" },
      prerequisiteCourseId: { type: "rich_text" },
      passingScore:         { type: "number" },
      maxAttempts:          { type: "number" },
      published:            { type: "checkbox" },
      createdAt:            { type: "date" },
      updatedAt:            { type: "date" },
    },
  },
  {
    envKey: "QUESTION",
    title: "Question",
    properties: {
      text:        { type: "title" },
      id:          { type: "rich_text" },
      testId:      { type: "rich_text" },
      order:       { type: "number" },
      type:        { type: "select", options: ["SINGLE", "MULTIPLE"] },
      explanation: { type: "rich_text" },
      createdAt:   { type: "date" },
      updatedAt:   { type: "date" },
    },
  },
  {
    envKey: "CHOICE",
    title: "Choice",
    properties: {
      text:       { type: "title" },
      id:         { type: "rich_text" },
      questionId: { type: "rich_text" },
      order:      { type: "number" },
      isCorrect:  { type: "checkbox" },
      createdAt:  { type: "date" },
      updatedAt:  { type: "date" },
    },
  },
  // ----- アプリ系 -----
  {
    envKey: "USER",
    title: "User",
    properties: {
      name:           { type: "title" },
      id:             { type: "rich_text" },
      email:          { type: "email" },
      role:           { type: "select", options: ["STUDENT", "ADMIN"] },
      passwordHash:   { type: "rich_text" },
      clerkUserId:    { type: "rich_text" },
      sessionVersion: { type: "number" },
      deactivated:    { type: "checkbox" },
      createdAt:      { type: "date" },
      updatedAt:      { type: "date" },
    },
  },
  {
    envKey: "ENROLLMENT",
    title: "Enrollment",
    properties: {
      name:        { type: "title" },
      id:          { type: "rich_text" },
      userId:      { type: "rich_text" },
      courseId:    { type: "rich_text" },
      assignedAt:  { type: "date" },
      dueAt:       { type: "date" },
      completedAt: { type: "date" },
    },
  },
  {
    envKey: "PROGRESS",
    title: "Progress",
    properties: {
      name:            { type: "title" },
      id:              { type: "rich_text" },
      userId:          { type: "rich_text" },
      lessonId:        { type: "rich_text" },
      watchedSec:      { type: "number" },
      lastPositionSec: { type: "number" },
      completed:       { type: "checkbox" },
      completedAt:     { type: "date" },
      updatedAt:       { type: "date" },
    },
  },
  {
    envKey: "SUBMISSION",
    title: "Submission",
    properties: {
      name:        { type: "title" },
      id:          { type: "rich_text" },
      userId:      { type: "rich_text" },
      testId:      { type: "rich_text" },
      status:      { type: "select", options: ["IN_PROGRESS", "PASSED", "FAILED", "ABANDONED"] },
      score:       { type: "number" },
      attemptNo:   { type: "number" },
      startedAt:   { type: "date" },
      submittedAt: { type: "date" },
    },
  },
  {
    envKey: "ANSWER",
    title: "Answer",
    properties: {
      name:         { type: "title" },
      id:           { type: "rich_text" },
      submissionId: { type: "rich_text" },
      questionId:   { type: "rich_text" },
      choiceId:     { type: "rich_text" },
      createdAt:    { type: "date" },
    },
  },
  {
    envKey: "AUDIT_LOG",
    title: "AuditLog",
    properties: {
      name:     { type: "title" },
      id:       { type: "rich_text" },
      actorId:  { type: "rich_text" },
      action:   { type: "rich_text" },
      target:   { type: "rich_text" },
      diff:     { type: "rich_text" },
      prevHash: { type: "rich_text" },
      hash:     { type: "rich_text" },
      at:       { type: "date" },
    },
  },
];

// ---------- property 変換 ----------

type NotionPropertySchema = Record<string, unknown>;

function buildProperties(defs: Record<string, PropertyDef>): NotionPropertySchema {
  const result: NotionPropertySchema = {};
  for (const [key, def] of Object.entries(defs)) {
    switch (def.type) {
      case "title":
        result[key] = { title: {} };
        break;
      case "rich_text":
        result[key] = { rich_text: {} };
        break;
      case "number":
        result[key] = { number: {} };
        break;
      case "checkbox":
        result[key] = { checkbox: {} };
        break;
      case "date":
        result[key] = { date: {} };
        break;
      case "email":
        result[key] = { email: {} };
        break;
      case "url":
        result[key] = { url: {} };
        break;
      case "select":
        result[key] = {
          select: {
            options: def.options.map((name) => ({ name })),
          },
        };
        break;
    }
  }
  return result;
}

// ---------- 既存 DB 検索 ----------

async function findExistingDb(parentPageId: string, title: string): Promise<string | null> {
  const res = await throttledRequest(() =>
    client.search({
      query: title,
    }),
  );

  for (const item of res.results) {
    if (item.object !== "data_source") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = item as any;
    const parentId = db.parent?.page_id ?? db.parent?.data_source_id ?? "";
    const dbTitle = (db.title ?? []).map((t: { plain_text: string }) => t.plain_text).join("");
    if (
      parentId.replace(/-/g, "") === parentPageId.replace(/-/g, "") &&
      dbTitle === title
    ) {
      return db.id as string;
    }
  }
  return null;
}

// ---------- DB 作成 ----------

async function createDb(parentPageId: string, def: DbDef): Promise<string> {
  // @notionhq/client v5 では dataSources.create を使用 (properties フィールドが存在する)
  const created = await throttledRequest(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client.dataSources as any).create({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: def.title } }],
      properties: buildProperties(def.properties),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (created as any).id as string;
}

// ---------- メイン ----------

async function main(): Promise<void> {
  process.stdout.write("Notion 11 DB セットアップを開始します...\n\n");

  // 親ページへのアクセス確認
  try {
    await throttledRequest(() =>
      client.pages.retrieve({ page_id: NOTION_PARENT_PAGE_ID! }),
    );
    process.stdout.write(`親ページ (${NOTION_PARENT_PAGE_ID}) へのアクセスを確認しました。\n\n`);
  } catch (err) {
    process.stderr.write(
      `ERROR: 親ページ (${NOTION_PARENT_PAGE_ID}) にアクセスできません。\n` +
        "Notion ページに Integration が「コネクト」されているか確認してください。\n" +
        `詳細: ${String(err)}\n`,
    );
    process.exit(1);
  }

  const results: { envKey: string; dbId: string; skipped: boolean }[] = [];

  for (const def of DB_DEFS) {
    // 既存 DB を検索
    const existingId = await findExistingDb(NOTION_PARENT_PAGE_ID!, def.title);
    if (existingId) {
      process.stdout.write(`[SKIP] ${def.title} は既に存在します (id: ${existingId})\n`);
      results.push({ envKey: def.envKey, dbId: existingId, skipped: true });
      continue;
    }

    // DB 作成
    try {
      const dbId = await createDb(NOTION_PARENT_PAGE_ID!, def);
      process.stdout.write(`[OK]   ${def.title} を作成しました (id: ${dbId})\n`);
      results.push({ envKey: def.envKey, dbId, skipped: false });
    } catch (err) {
      process.stderr.write(`[ERROR] ${def.title} の作成に失敗しました: ${String(err)}\n`);
      process.exit(1);
    }
  }

  // env 変数として出力
  process.stdout.write("\n--- .env.local に追加してください ---\n\n");
  process.stdout.write(`DATA_DRIVER=notion\n`);
  process.stdout.write(`NOTION_TOKEN=${NOTION_TOKEN}\n`);
  process.stdout.write(`NOTION_PARENT_PAGE_ID=${NOTION_PARENT_PAGE_ID}\n`);
  for (const { envKey, dbId } of results) {
    process.stdout.write(`NOTION_DB_${envKey}=${dbId}\n`);
  }
  process.stdout.write("\n--- ここまで ---\n");
  process.stdout.write("\nセットアップ完了。上記の env 変数を .env.local に貼り付けて `pnpm dev` を実行してください。\n");
}

main().catch((err) => {
  process.stderr.write(`予期しないエラー: ${String(err)}\n`);
  process.exit(1);
});
