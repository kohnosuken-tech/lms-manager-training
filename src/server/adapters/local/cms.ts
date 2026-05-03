/**
 * local/cms.ts — TSV fixture ベースの CmsPort 実装。
 *
 * CMS_SOURCE=local (デフォルト) 時に使用する。
 * 起動時に gas/seed-data/{course,lesson,test,question,choice}.tsv を読み込み、
 * in-memory に保持してすべてのメソッドを同期的に解決する。
 *
 * - TSV fixture が存在しない / 破損している場合は空配列を返す (例外を throw しない)
 * - 書き込み機能は不要 (read-only)
 * - 列マップは gas/Code.gs の HEADERS 定数と同じ
 */

import * as fs from "fs";
import * as path from "path";
import type {
  CmsPort,
  Course,
  Lesson,
  Test,
  Question,
  Choice,
} from "@/server/ports/cms";

// ---------- TSV パーサ ----------

/**
 * TSV 文字列を行ごとに分割し、各行をタブ区切りのフィールド配列として返す。
 * 空行はスキップする。
 */
function parseTsv(content: string): string[][] {
  return content
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((row) => row.some((cell) => cell.trim() !== ""));
}

/**
 * gas/Code.gs の coerceValue_ と同等の型変換を TypeScript で実装。
 *
 * booleanCols / numberCols は Code.gs と同じ定義。
 * 空文字は number → null, boolean → false, date → null, その他 → "" を返す。
 */
type SheetName = "Course" | "Lesson" | "Test" | "Question" | "Choice";

const BOOLEAN_COLS: Record<SheetName, string[]> = {
  Course:   ["published"],
  Lesson:   ["blockSeek"],
  Test:     ["published"],
  Question: [],
  Choice:   ["isCorrect"],
};

const NUMBER_COLS: Record<SheetName, string[]> = {
  Course:   ["order"],
  Lesson:   ["durationSec", "order", "requiredCompletionRate"],
  Test:     ["passingScore", "maxAttempts"],
  Question: ["order"],
  Choice:   ["order"],
};

function coerceValue(sheet: SheetName, col: string, raw: string): unknown {
  const isEmpty = raw === "" || raw === undefined;

  if ((NUMBER_COLS[sheet] ?? []).includes(col)) {
    if (isEmpty) return null;
    const n = Number(raw);
    return isFinite(n) ? n : null;
  }
  if ((BOOLEAN_COLS[sheet] ?? []).includes(col)) {
    if (isEmpty) return false;
    const s = raw.trim().toUpperCase();
    return s === "TRUE" || s === "1" || s === "YES";
  }
  // createdAt / updatedAt はそのまま文字列 (ISO8601 か空)
  if (isEmpty) return "";
  return raw;
}

/**
 * TSV ファイルを読み込んでオブジェクト配列に変換する。
 * ファイルが存在しないかパースエラーの場合は空配列を返す。
 *
 * TSV は **ヘッダ行なし** (gas/Code.gs の HEADERS 定数が列順を規定する)。
 */
function loadTsv<T extends object>(
  filePath: string,
  sheet: SheetName,
  columns: string[],
): T[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    // ファイルが存在しない
    return [];
  }
  try {
    const rows = parseTsv(content);
    return rows.map((cells) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]!;
        const raw = cells[i] ?? "";
        obj[col] = coerceValue(sheet, col, raw);
      }
      return obj as T;
    });
  } catch {
    return [];
  }
}

// ---------- TSV 列定義 (gas/Code.gs HEADERS と同じ順序) ----------

const COURSE_COLS = ["id", "title", "description", "order", "published", "createdAt", "updatedAt"];
const LESSON_COLS = ["id", "courseId", "title", "description", "videoUrl", "durationSec", "order", "blockSeek", "requiredCompletionRate", "createdAt", "updatedAt"];
const TEST_COLS   = ["id", "courseId", "title", "passingScore", "maxAttempts", "published", "createdAt", "updatedAt"];
const QUESTION_COLS = ["id", "testId", "order", "type", "text", "createdAt", "updatedAt"];
const CHOICE_COLS   = ["id", "questionId", "order", "text", "isCorrect", "createdAt", "updatedAt"];

// ---------- fixture ファイルパス ----------

// process.cwd() はプロジェクトルートを想定 (Next.js / vitest ともに同じ)
function seedDataDir(): string {
  return path.join(process.cwd(), "gas", "seed-data");
}

// ---------- in-memory ストア (遅延ロード) ----------

type Store = {
  courses:   Course[];
  lessons:   Lesson[];
  tests:     Test[];
  questions: Question[];
  choices:   Choice[];
};

let _store: Store | null = null;

function getStore(): Store {
  if (_store) return _store;

  const dir = seedDataDir();

  const rawCourses = loadTsv<{
    id: string; title: string; description: string; order: number | null;
    published: boolean; createdAt: string; updatedAt: string;
  }>(path.join(dir, "course.tsv"), "Course", COURSE_COLS);

  const rawLessons = loadTsv<{
    id: string; courseId: string; title: string; description: string;
    videoUrl: string; durationSec: number | null; order: number | null;
    blockSeek: boolean; requiredCompletionRate: number | null;
    createdAt: string; updatedAt: string;
  }>(path.join(dir, "lesson.tsv"), "Lesson", LESSON_COLS);

  const rawTests = loadTsv<{
    id: string; courseId: string; title: string;
    passingScore: number | null; maxAttempts: number | null;
    published: boolean; createdAt: string; updatedAt: string;
  }>(path.join(dir, "test.tsv"), "Test", TEST_COLS);

  const rawQuestions = loadTsv<{
    id: string; testId: string; order: number | null;
    type: string; text: string; createdAt: string; updatedAt: string;
  }>(path.join(dir, "question.tsv"), "Question", QUESTION_COLS);

  const rawChoices = loadTsv<{
    id: string; questionId: string; order: number | null;
    text: string; isCorrect: boolean; createdAt: string; updatedAt: string;
  }>(path.join(dir, "choice.tsv"), "Choice", CHOICE_COLS);

  _store = {
    courses: rawCourses.map((r) => ({
      id:          r.id,
      title:       r.title,
      description: r.description,
      order:       r.order ?? 0,
      published:   r.published,
      createdAt:   r.createdAt || new Date(0).toISOString(),
      updatedAt:   r.updatedAt || new Date(0).toISOString(),
    })),
    lessons: rawLessons.map((r) => ({
      id:                     r.id,
      courseId:               r.courseId,
      title:                  r.title,
      description:            r.description,
      videoUrl:               r.videoUrl,
      durationSec:            r.durationSec,
      order:                  r.order ?? 0,
      blockSeek:              r.blockSeek,
      requiredCompletionRate: r.requiredCompletionRate,
      createdAt:              r.createdAt || new Date(0).toISOString(),
      updatedAt:              r.updatedAt || new Date(0).toISOString(),
    })),
    tests: rawTests.map((r) => ({
      id:           r.id,
      courseId:     r.courseId,
      title:        r.title,
      passingScore: r.passingScore,
      maxAttempts:  r.maxAttempts,
      published:    r.published,
      createdAt:    r.createdAt || new Date(0).toISOString(),
      updatedAt:    r.updatedAt || new Date(0).toISOString(),
    })),
    questions: rawQuestions.map((r) => ({
      id:        r.id,
      testId:    r.testId,
      order:     r.order ?? 0,
      type:      (r.type === "MULTIPLE" ? "MULTIPLE" : "SINGLE") as "SINGLE" | "MULTIPLE",
      text:      r.text,
      createdAt: r.createdAt || new Date(0).toISOString(),
      updatedAt: r.updatedAt || new Date(0).toISOString(),
    })),
    choices: rawChoices.map((r) => ({
      id:         r.id,
      questionId: r.questionId,
      order:      r.order ?? 0,
      text:       r.text,
      isCorrect:  r.isCorrect,
      createdAt:  r.createdAt || new Date(0).toISOString(),
      updatedAt:  r.updatedAt || new Date(0).toISOString(),
    })),
  };

  return _store;
}

/** テスト時にストアをリセットする (vitest から呼ぶ) */
export function _resetStore(): void {
  _store = null;
}

// ---------- CmsPort 実装 ----------

export const localCms: CmsPort = {
  async listCourses(): Promise<Course[]> {
    const { courses } = getStore();
    return [...courses].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.createdAt.localeCompare(b.createdAt);
    });
  },

  async listLessons(courseId?: string): Promise<Lesson[]> {
    const { lessons } = getStore();
    const filtered = courseId ? lessons.filter((l) => l.courseId === courseId) : lessons;
    return [...filtered].sort((a, b) => {
      if (a.courseId !== b.courseId) return a.courseId.localeCompare(b.courseId);
      return a.order - b.order;
    });
  },

  async listTests(courseId?: string): Promise<Test[]> {
    const { tests } = getStore();
    const filtered = courseId ? tests.filter((t) => t.courseId === courseId) : tests;
    return [...filtered].sort((a, b) => {
      if (a.courseId !== b.courseId) return a.courseId.localeCompare(b.courseId);
      return a.createdAt.localeCompare(b.createdAt);
    });
  },

  async listQuestions(testId?: string): Promise<Question[]> {
    const { questions } = getStore();
    const filtered = testId ? questions.filter((q) => q.testId === testId) : questions;
    return [...filtered].sort((a, b) => {
      if (a.testId !== b.testId) return a.testId.localeCompare(b.testId);
      return a.order - b.order;
    });
  },

  async listChoices(questionId?: string): Promise<Choice[]> {
    const { choices } = getStore();
    const filtered = questionId ? choices.filter((c) => c.questionId === questionId) : choices;
    return [...filtered].sort((a, b) => {
      if (a.questionId !== b.questionId) return a.questionId.localeCompare(b.questionId);
      return a.order - b.order;
    });
  },

  async getCourse(id: string): Promise<Course | null> {
    const { courses } = getStore();
    return courses.find((c) => c.id === id) ?? null;
  },

  async getLesson(id: string): Promise<Lesson | null> {
    const { lessons } = getStore();
    return lessons.find((l) => l.id === id) ?? null;
  },

  async getTest(id: string): Promise<Test | null> {
    const { tests } = getStore();
    return tests.find((t) => t.id === id) ?? null;
  },

  async getQuestion(id: string): Promise<Question | null> {
    const { questions } = getStore();
    return questions.find((q) => q.id === id) ?? null;
  },
};
