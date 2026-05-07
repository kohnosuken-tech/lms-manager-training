/**
 * Notion adapter — ProgressPort 実装 (write queue 込み)
 *
 * 読み取り: キャッシュなし
 * 書き込み: ProgressWriteQueue 経由で 30 秒バッファ
 * flushNow(): テスト / graceful shutdown で即時書き込み
 *
 * env: NOTION_DB_PROGRESS
 */

import { randomUUID } from "node:crypto";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type {
  ProgressPort,
  Progress,
  UpsertProgressInput,
} from "@/server/ports/progress";
import { queryAll, createPage, updatePage } from "./db-helpers";
import { ProgressWriteQueue, type PendingProgress } from "./write-queue";
import {
  readRichText,
  readNumber,
  readCheckbox,
  readDate,
  readDateOrNull,
  writeTitleProp,
  writeRichTextProp,
  writeNumberProp,
  writeCheckboxProp,
  writeDateProp,
} from "./property-mapper";

function dbId(): string {
  const val = process.env.NOTION_DB_PROGRESS;
  if (!val) throw new Error("[notion/progress] NOTION_DB_PROGRESS が未設定です。");
  return val;
}

function toProgress(page: PageObjectResponse): Progress {
  const p = page.properties;
  return {
    id:              readRichText(p["id"]!),
    userId:          readRichText(p["userId"]!),
    lessonId:        readRichText(p["lessonId"]!),
    watchedSec:      readNumber(p["watchedSec"]!),
    lastPositionSec: readNumber(p["lastPositionSec"]!),
    completed:       readCheckbox(p["completed"]!),
    completedAt:     readDateOrNull(p["completedAt"]!),
    updatedAt:       readDate(p["updatedAt"]!),
  };
}

/** Notion に Progress を upsert する (内部実装) */
async function notionUpsert(item: PendingProgress): Promise<void> {
  const pages = await queryAll(dbId());
  const target = pages.find(
    (p) =>
      readRichText(p.properties["userId"]!) === item.userId &&
      readRichText(p.properties["lessonId"]!) === item.lessonId,
  );

  const name = `${item.userId}:${item.lessonId}`;
  const props: Record<string, unknown> = {
    name:            writeTitleProp(name),
    watchedSec:      writeNumberProp(item.watchedSec),
    lastPositionSec: writeNumberProp(item.lastPositionSec),
    completed:       writeCheckboxProp(item.completed),
    completedAt:     writeDateProp(item.completedAt),
    updatedAt:       writeDateProp(item.updatedAt),
  };

  if (target) {
    await updatePage(target.id, props);
  } else {
    const id = randomUUID();
    await createPage(dbId(), {
      ...props,
      id:       writeRichTextProp(id),
      userId:   writeRichTextProp(item.userId),
      lessonId: writeRichTextProp(item.lessonId),
    });
  }
}

/** write queue の flush 関数 */
async function flushItems(items: PendingProgress[]): Promise<void> {
  for (const item of items) {
    await notionUpsert(item);
  }
}

/** グローバルシングルトンの write queue (30 秒バッファ) */
export const progressWriteQueue = new ProgressWriteQueue(flushItems, 30_000);

// サーバー起動時にタイマーをスタート (テスト環境では手動で start/stop する)
if (process.env.NODE_ENV !== "test") {
  progressWriteQueue.start();
}

export const notionProgress: ProgressPort = {
  async findByUserAndLesson(userId: string, lessonId: string): Promise<Progress | null> {
    const pages = await queryAll(dbId());
    const page = pages.find(
      (p) =>
        readRichText(p.properties["userId"]!) === userId &&
        readRichText(p.properties["lessonId"]!) === lessonId,
    );
    return page ? toProgress(page) : null;
  },

  async findByUser(userId: string): Promise<Progress[]> {
    const pages = await queryAll(dbId());
    return pages
      .filter((p) => readRichText(p.properties["userId"]!) === userId)
      .map(toProgress);
  },

  async findByUserAndLessons(userId: string, lessonIds: string[]): Promise<Progress[]> {
    const pages = await queryAll(dbId());
    const lessonSet = new Set(lessonIds);
    return pages
      .filter(
        (p) =>
          readRichText(p.properties["userId"]!) === userId &&
          lessonSet.has(readRichText(p.properties["lessonId"]!)),
      )
      .map(toProgress);
  },

  async upsert(input: UpsertProgressInput): Promise<Progress> {
    const pending: PendingProgress = {
      userId:          input.userId,
      lessonId:        input.lessonId,
      watchedSec:      input.watchedSec,
      lastPositionSec: input.lastPositionSec,
      completed:       input.completed,
      completedAt:     input.completedAt ?? null,
      updatedAt:       new Date().toISOString(),
    };

    progressWriteQueue.enqueue(pending);

    // 楽観的レスポンス (Notion には非同期で書き込む)
    return {
      id:              `optimistic:${input.userId}:${input.lessonId}`,
      userId:          input.userId,
      lessonId:        input.lessonId,
      watchedSec:      input.watchedSec,
      lastPositionSec: input.lastPositionSec,
      completed:       input.completed,
      completedAt:     input.completedAt ?? null,
      updatedAt:       pending.updatedAt,
    };
  },

  async flushNow(): Promise<void> {
    await progressWriteQueue.flushNow();
  },
};
