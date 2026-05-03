/**
 * Spreadsheet (GAS) 経由の CmsPort 実装。
 * - callGas() で GAS Web App を呼び出す
 * - 5 分間のインメモリキャッシュで重複呼出を抑制する (docs/architecture.md §8.7)
 */

import type {
  CmsPort,
  Course,
  Lesson,
  Test,
  Question,
  Choice,
} from "@/server/ports/cms";
import { callGas } from "./gas-client";

// ---- キャッシュ ----

const TTL_MS = 5 * 60 * 1000; // 5 分

type CacheEntry<T> = { data: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cachedCall<T>(
  cacheKey: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(cacheKey) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.data;
  }

  const res = await callGas<T>(action, params);
  if (!res.ok) {
    throw new Error(
      `[spreadsheet/cms] GAS returned error for ${action}: [${res.error.code}] ${res.error.message}`,
    );
  }

  cache.set(cacheKey, { data: res.data, expiresAt: now + TTL_MS });
  return res.data;
}

/** テスト用: キャッシュを全クリアする */
export function clearCmsCache(): void {
  cache.clear();
}

// ---- CmsPort 実装 ----

export const spreadsheetCms: CmsPort = {
  async listCourses(): Promise<Course[]> {
    return cachedCall<Course[]>("list_courses:", "list_courses");
  },

  async listLessons(courseId?: string): Promise<Lesson[]> {
    const key = `list_lessons:${courseId ?? ""}`;
    const params = courseId ? { courseId } : {};
    return cachedCall<Lesson[]>(key, "list_lessons", params);
  },

  async listTests(courseId?: string): Promise<Test[]> {
    const key = `list_tests:${courseId ?? ""}`;
    const params = courseId ? { courseId } : {};
    return cachedCall<Test[]>(key, "list_tests", params);
  },

  async listQuestions(testId?: string): Promise<Question[]> {
    const key = `list_questions:${testId ?? ""}`;
    const params = testId ? { testId } : {};
    return cachedCall<Question[]>(key, "list_questions", params);
  },

  async listChoices(questionId?: string): Promise<Choice[]> {
    const key = `list_choices:${questionId ?? ""}`;
    const params = questionId ? { questionId } : {};
    return cachedCall<Choice[]>(key, "list_choices", params);
  },
};
