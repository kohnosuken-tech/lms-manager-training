// CmsPort: コース/レッスン/テスト/設問/選択肢の読取インターフェース
// 実装は sqlite (Prisma) または spreadsheet (GAS) を env で切替える

export type Course = {
  id: string;
  title: string;
  description: string;
  order: number;
  published: boolean;
  createdAt: string; // ISO8601
  updatedAt: string;
};

export type Lesson = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  videoUrl: string;
  durationSec: number | null;
  order: number;
  blockSeek: boolean;
  requiredCompletionRate: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Test = {
  id: string;
  courseId: string;
  title: string;
  passingScore: number | null;
  maxAttempts: number | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Question = {
  id: string;
  testId: string;
  order: number;
  type: "SINGLE" | "MULTIPLE";
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type Choice = {
  id: string;
  questionId: string;
  order: number;
  text: string;
  isCorrect: boolean;
  createdAt: string;
  updatedAt: string;
};

export interface CmsPort {
  listCourses(): Promise<Course[]>;
  listLessons(courseId?: string): Promise<Lesson[]>;
  listTests(courseId?: string): Promise<Test[]>;
  listQuestions(testId?: string): Promise<Question[]>;
  listChoices(questionId?: string): Promise<Choice[]>;

  // id ベース取得 (内部で list を呼び、キャッシュを活用)
  getCourse(id: string): Promise<Course | null>;
  getLesson(id: string): Promise<Lesson | null>;
  getTest(id: string): Promise<Test | null>;
  getQuestion(id: string): Promise<Question | null>;
}
