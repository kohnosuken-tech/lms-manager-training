/**
 * Notion adapter — CmsPort 実装
 *
 * Course / Lesson / Test / Question / Choice の read-only アクセス。
 * キャッシュ: long (5 分 in-memory)
 *
 * env:
 *   NOTION_DB_COURSE / LESSON / TEST / QUESTION / CHOICE
 */

import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type {
  CmsPort,
  Course,
  Lesson,
  Test,
  Question,
  Choice,
} from "@/server/ports/cms";
import { cached } from "./cache";
import { queryAll } from "./db-helpers";
import {
  readRichText,
  readTitle,
  readNumber,
  readNumberOrNull,
  readCheckbox,
  readSelect,
  readDate,
  readUrl,
} from "./property-mapper";

// ---------- env helpers ----------

function dbId(name: string): string {
  const val = process.env[`NOTION_DB_${name}`];
  if (!val) {
    throw new Error(
      `[notion/cms] 環境変数 NOTION_DB_${name} が設定されていません。`,
    );
  }
  return val;
}

// ---------- DTO マッパー ----------

function toCourse(page: PageObjectResponse): Course {
  const p = page.properties;
  return {
    id:          readRichText(p["id"]!),
    title:       readTitle(p["title"]!),
    description: readRichText(p["description"]!),
    order:       readNumber(p["order"]!),
    published:   readCheckbox(p["published"]!),
    createdAt:   readDate(p["createdAt"]!),
    updatedAt:   readDate(p["updatedAt"]!),
  };
}

function toLesson(page: PageObjectResponse): Lesson {
  const p = page.properties;
  return {
    id:                     readRichText(p["id"]!),
    courseId:               readRichText(p["courseId"]!),
    title:                  readTitle(p["title"]!),
    description:            readRichText(p["description"]!),
    videoUrl:               readUrl(p["videoUrl"]!),
    durationSec:            readNumberOrNull(p["durationSec"]!),
    order:                  readNumber(p["order"]!),
    blockSeek:              readCheckbox(p["blockSeek"]!),
    requiredCompletionRate: readNumberOrNull(p["requiredCompletionRate"]!),
    createdAt:              readDate(p["createdAt"]!),
    updatedAt:              readDate(p["updatedAt"]!),
  };
}

function toTest(page: PageObjectResponse): Test {
  const p = page.properties;
  return {
    id:           readRichText(p["id"]!),
    courseId:     readRichText(p["courseId"]!),
    title:        readTitle(p["title"]!),
    passingScore: readNumberOrNull(p["passingScore"]!),
    maxAttempts:  readNumberOrNull(p["maxAttempts"]!),
    published:    readCheckbox(p["published"]!),
    createdAt:    readDate(p["createdAt"]!),
    updatedAt:    readDate(p["updatedAt"]!),
  };
}

function toQuestion(page: PageObjectResponse): Question {
  const p = page.properties;
  const type = readSelect(p["type"]!);
  return {
    id:        readRichText(p["id"]!),
    testId:    readRichText(p["testId"]!),
    order:     readNumber(p["order"]!),
    type:      (type === "MULTIPLE" ? "MULTIPLE" : "SINGLE") as "SINGLE" | "MULTIPLE",
    text:      readTitle(p["text"]!),
    createdAt: readDate(p["createdAt"]!),
    updatedAt: readDate(p["updatedAt"]!),
  };
}

function toChoice(page: PageObjectResponse): Choice {
  const p = page.properties;
  return {
    id:         readRichText(p["id"]!),
    questionId: readRichText(p["questionId"]!),
    order:      readNumber(p["order"]!),
    text:       readTitle(p["text"]!),
    isCorrect:  readCheckbox(p["isCorrect"]!),
    createdAt:  readDate(p["createdAt"]!),
    updatedAt:  readDate(p["updatedAt"]!),
  };
}

// ---------- CmsPort 実装 ----------

export const notionCms: CmsPort = {
  async listCourses(): Promise<Course[]> {
    return cached("course:list", "long", async () => {
      const pages = await queryAll(dbId("COURSE"));
      return pages.map(toCourse).sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.createdAt.localeCompare(b.createdAt);
      });
    });
  },

  async listLessons(courseId?: string): Promise<Lesson[]> {
    const key = `lesson:list:${courseId ?? ""}`;
    return cached(key, "long", async () => {
      const pages = await queryAll(dbId("LESSON"));
      const all = pages.map(toLesson);
      const filtered = courseId ? all.filter((l) => l.courseId === courseId) : all;
      return filtered.sort((a, b) => {
        if (a.courseId !== b.courseId) return a.courseId.localeCompare(b.courseId);
        return a.order - b.order;
      });
    });
  },

  async listTests(courseId?: string): Promise<Test[]> {
    const key = `test:list:${courseId ?? ""}`;
    return cached(key, "long", async () => {
      const pages = await queryAll(dbId("TEST"));
      const all = pages.map(toTest);
      const filtered = courseId ? all.filter((t) => t.courseId === courseId) : all;
      return filtered.sort((a, b) => {
        if (a.courseId !== b.courseId) return a.courseId.localeCompare(b.courseId);
        return a.createdAt.localeCompare(b.createdAt);
      });
    });
  },

  async listQuestions(testId?: string): Promise<Question[]> {
    const key = `question:list:${testId ?? ""}`;
    return cached(key, "long", async () => {
      const pages = await queryAll(dbId("QUESTION"));
      const all = pages.map(toQuestion);
      const filtered = testId ? all.filter((q) => q.testId === testId) : all;
      return filtered.sort((a, b) => {
        if (a.testId !== b.testId) return a.testId.localeCompare(b.testId);
        return a.order - b.order;
      });
    });
  },

  async listChoices(questionId?: string): Promise<Choice[]> {
    const key = `choice:list:${questionId ?? ""}`;
    return cached(key, "long", async () => {
      const pages = await queryAll(dbId("CHOICE"));
      const all = pages.map(toChoice);
      const filtered = questionId ? all.filter((c) => c.questionId === questionId) : all;
      return filtered.sort((a, b) => {
        if (a.questionId !== b.questionId) return a.questionId.localeCompare(b.questionId);
        return a.order - b.order;
      });
    });
  },

  async getCourse(id: string): Promise<Course | null> {
    const courses = await notionCms.listCourses();
    return courses.find((c) => c.id === id) ?? null;
  },

  async getLesson(id: string): Promise<Lesson | null> {
    const lessons = await notionCms.listLessons();
    return lessons.find((l) => l.id === id) ?? null;
  },

  async getTest(id: string): Promise<Test | null> {
    const tests = await notionCms.listTests();
    return tests.find((t) => t.id === id) ?? null;
  },

  async getQuestion(id: string): Promise<Question | null> {
    const questions = await notionCms.listQuestions();
    return questions.find((q) => q.id === id) ?? null;
  },
};
