/**
 * notion-import-cms.ts — gas/seed-data/*.tsv の CMS データを Notion に投入する
 *
 * 使い方:
 *   pnpm exec tsx --env-file=.env.local scripts/notion-import-cms.ts
 *
 * 必須 env:
 *   NOTION_TOKEN
 *   NOTION_DB_COURSE / LESSON / TEST / QUESTION / CHOICE
 *
 * 動作:
 *   1. gas/seed-data/{course,lesson,test,question,choice}.tsv を読み込む
 *   2. 既存レコード (id 一致) は skip
 *   3. 新規レコードを Notion に create
 *   4. レート制限あり (3 req/s)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "@notionhq/client";
import { TokenBucket } from "../src/server/adapters/notion/rate-limiter";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) {
  process.stderr.write("ERROR: NOTION_TOKEN が未設定です。\n--env-file=.env.local を指定してください。\n");
  process.exit(1);
}

const client = new Client({ auth: NOTION_TOKEN });
const limiter = new TokenBucket(5, 3, 30_000);

async function throttle<T>(fn: () => Promise<T>): Promise<T> {
  await limiter.acquire();
  return fn();
}

function parseTsv(content: string): string[][] {
  return content
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((row) => row.some((cell) => cell.trim() !== ""));
}

function dbEnv(name: string): string {
  const val = process.env[`NOTION_DB_${name}`];
  if (!val) throw new Error(`NOTION_DB_${name} が未設定です。`);
  return val;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = any;

async function getExistingIds(databaseId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined = undefined;
  do {
    const res = await throttle(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client.dataSources as any).query({
        data_source_id: databaseId,
        start_cursor: cursor,
        page_size: 100,
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = res as any;
    for (const p of (r.results ?? [])) {
      if (p.object !== "page") continue;
      const idProp = p.properties?.["id"];
      if (idProp?.type === "rich_text") {
        const text = (idProp.rich_text ?? []).map((t: { plain_text: string }) => t.plain_text).join("");
        if (text) ids.add(text);
      }
    }
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return ids;
}

function rt(v: string | undefined): AnyProps { return { rich_text: [{ text: { content: v ?? "" } }] }; }
function titleProp(v: string | undefined): AnyProps { return { title: [{ text: { content: v ?? "" } }] }; }
function num(v: string | null | undefined): AnyProps { return { number: v === null || v === undefined || v === "" ? null : Number(v) }; }
function chk(v: string | undefined): AnyProps { return { checkbox: v === "TRUE" || v === "1" || v === "true" }; }
function dt(v: string | undefined): AnyProps { return v ? { date: { start: v } } : { date: null }; }
function urlProp(v: string | undefined): AnyProps { return { url: v || null }; }
function sel(v: string | undefined): AnyProps { return { select: v ? { name: v } : null }; }

async function createRecord(dataSourceId: string, properties: AnyProps): Promise<void> {
  await throttle(() =>
    client.pages.create({
      parent: { type: "data_source_id", data_source_id: dataSourceId } as AnyProps,
      properties,
    }),
  );
}

async function importCourses(): Promise<void> {
  const dataSourceId = dbEnv("COURSE");
  const existing = await getExistingIds(dataSourceId);
  const tsvPath = path.join(process.cwd(), "gas/seed-data/course.tsv");
  const rows = parseTsv(fs.readFileSync(tsvPath, "utf-8"));
  let created = 0;
  for (const [id, titleVal, description, order, published, createdAt, updatedAt] of rows) {
    if (!id || existing.has(id)) continue;
    await createRecord(dataSourceId, {
      name:        titleProp(titleVal),
      id:          rt(id),
      description: rt(description),
      order:       num(order),
      published:   chk(published),
      createdAt:   dt(createdAt),
      updatedAt:   dt(updatedAt),
    });
    created++;
    process.stdout.write(`  Course: ${titleVal} を作成\n`);
  }
  process.stdout.write(`Course: ${created} 件作成 (${existing.size} 件スキップ)\n`);
}

async function importLessons(): Promise<void> {
  const dataSourceId = dbEnv("LESSON");
  const existing = await getExistingIds(dataSourceId);
  const tsvPath = path.join(process.cwd(), "gas/seed-data/lesson.tsv");
  const rows = parseTsv(fs.readFileSync(tsvPath, "utf-8"));
  let created = 0;
  for (const [id, courseId, titleVal, description, videoUrl, durationSec, order, blockSeek, requiredCompletionRate, createdAt, updatedAt] of rows) {
    if (!id || existing.has(id)) continue;
    await createRecord(dataSourceId, {
      name:                   titleProp(titleVal),
      id:                     rt(id),
      courseId:               rt(courseId),
      description:            rt(description),
      videoUrl:               urlProp(videoUrl),
      durationSec:            num(durationSec),
      order:                  num(order),
      blockSeek:              chk(blockSeek),
      requiredCompletionRate: num(requiredCompletionRate),
      createdAt:              dt(createdAt),
      updatedAt:              dt(updatedAt),
    });
    created++;
    process.stdout.write(`  Lesson: ${titleVal} を作成\n`);
  }
  process.stdout.write(`Lesson: ${created} 件作成 (${existing.size} 件スキップ)\n`);
}

async function importTests(): Promise<void> {
  const dataSourceId = dbEnv("TEST");
  const existing = await getExistingIds(dataSourceId);
  const tsvPath = path.join(process.cwd(), "gas/seed-data/test.tsv");
  const rows = parseTsv(fs.readFileSync(tsvPath, "utf-8"));
  let created = 0;
  for (const [id, courseId, titleVal, passingScore, maxAttempts, published, createdAt, updatedAt] of rows) {
    if (!id || existing.has(id)) continue;
    await createRecord(dataSourceId, {
      name:         titleProp(titleVal),
      id:           rt(id),
      courseId:     rt(courseId),
      passingScore: num(passingScore),
      maxAttempts:  num(maxAttempts),
      published:    chk(published),
      createdAt:    dt(createdAt),
      updatedAt:    dt(updatedAt),
    });
    created++;
    process.stdout.write(`  Test: ${titleVal} を作成\n`);
  }
  process.stdout.write(`Test: ${created} 件作成 (${existing.size} 件スキップ)\n`);
}

async function importQuestions(): Promise<void> {
  const dataSourceId = dbEnv("QUESTION");
  const existing = await getExistingIds(dataSourceId);
  const tsvPath = path.join(process.cwd(), "gas/seed-data/question.tsv");
  const rows = parseTsv(fs.readFileSync(tsvPath, "utf-8"));
  let created = 0;
  for (const [id, testId, order, type, text, createdAt, updatedAt] of rows) {
    if (!id || existing.has(id)) continue;
    await createRecord(dataSourceId, {
      text:      titleProp(text),
      id:        rt(id),
      testId:    rt(testId),
      order:     num(order),
      type:      sel(type),
      createdAt: dt(createdAt),
      updatedAt: dt(updatedAt),
    });
    created++;
  }
  process.stdout.write(`Question: ${created} 件作成 (${existing.size} 件スキップ)\n`);
}

async function importChoices(): Promise<void> {
  const dataSourceId = dbEnv("CHOICE");
  const existing = await getExistingIds(dataSourceId);
  const tsvPath = path.join(process.cwd(), "gas/seed-data/choice.tsv");
  const rows = parseTsv(fs.readFileSync(tsvPath, "utf-8"));
  let created = 0;
  for (const [id, questionId, order, text, isCorrect, createdAt, updatedAt] of rows) {
    if (!id || existing.has(id)) continue;
    await createRecord(dataSourceId, {
      text:       titleProp(text),
      id:         rt(id),
      questionId: rt(questionId),
      order:      num(order),
      isCorrect:  chk(isCorrect),
      createdAt:  dt(createdAt),
      updatedAt:  dt(updatedAt),
    });
    created++;
  }
  process.stdout.write(`Choice: ${created} 件作成 (${existing.size} 件スキップ)\n`);
}

async function main(): Promise<void> {
  process.stdout.write("CMS データを Notion に投入します...\n\n");
  await importCourses();
  await importLessons();
  await importTests();
  await importQuestions();
  await importChoices();
  process.stdout.write("\n完了。Notion 上で確認してください。\n");
}

main().catch((err) => {
  process.stderr.write(`エラー: ${String(err)}\n`);
  process.exit(1);
});
