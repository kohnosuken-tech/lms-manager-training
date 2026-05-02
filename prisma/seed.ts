import { PrismaClient, type Prisma } from "@prisma/client";

if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PROD_SEED) {
  throw new Error("seed forbidden in production");
}

const prisma = new PrismaClient();

async function reset() {
  // 依存関係順に削除 (FK on cascade があるが冪等性のため明示)
  await prisma.answer.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.choice.deleteMany();
  await prisma.question.deleteMany();
  await prisma.test.deleteMany();
  await prisma.progress.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await reset();

  const admin = await prisma.user.create({
    data: {
      email: "admin@example.com",
      name: "管理 太郎",
      role: "ADMIN",
    },
  });

  const students = await Promise.all(
    [
      { email: "student1@example.com", name: "受講 一郎" },
      { email: "student2@example.com", name: "受講 二郎" },
      { email: "student3@example.com", name: "受講 三郎" },
    ].map((s) =>
      prisma.user.create({
        data: { email: s.email, name: s.name, role: "STUDENT" },
      }),
    ),
  );

  const courseDefs = [
    {
      title: "ハラスメント基礎研修",
      description:
        "職場におけるハラスメントの基本概念と予防策を学ぶ入門コースです。",
      order: 0,
    },
    {
      title: "情報セキュリティ研修",
      description:
        "業務で扱う情報資産の安全な取り扱いとインシデント対応を学習します。",
      order: 1,
    },
  ];

  const courses = [];
  for (const c of courseDefs) {
    const course = await prisma.course.create({
      data: { ...c, published: true },
    });

    // Lesson x 3
    const lessonTitles =
      c.title === "ハラスメント基礎研修"
        ? ["第1回: ハラスメントとは", "第2回: 事例で学ぶ", "第3回: 予防と対応"]
        : ["第1回: 情報資産の基礎", "第2回: パスワード管理", "第3回: インシデント対応"];

    const lessons = [];
    for (let i = 0; i < lessonTitles.length; i++) {
      const lesson = await prisma.lesson.create({
        data: {
          courseId: course.id,
          title: lessonTitles[i],
          description: `${lessonTitles[i]} の概要を学びます。`,
          videoUrl: "/sample.mp4",
          durationSec: 600,
          order: i,
          blockSeek: false,
        },
      });
      lessons.push(lesson);
    }

    // Test + 3 SINGLE Questions x 4 Choices each
    const test = await prisma.test.create({
      data: {
        courseId: course.id,
        title: `${c.title} 確認テスト`,
        description: "学習内容の理解度を確認します。",
        passingScore: 70,
        maxAttempts: 3,
        shuffleQuestions: true,
        shuffleChoices: true,
        published: true,
      },
    });

    type QDef = { prompt: string; explanation: string; choices: string[]; correct: number };
    const questionDefs: QDef[] =
      c.title === "ハラスメント基礎研修"
        ? [
            {
              prompt: "ハラスメントの定義として最も適切なものは?",
              explanation:
                "相手の意に反する不快な言動が継続的または重大な場合に該当します。",
              choices: [
                "個人的な感情のすれ違い",
                "相手が不快に感じる継続的または重大な言動",
                "業務上必要な指導",
                "ユーモアの一種",
              ],
              correct: 1,
            },
            {
              prompt: "ハラスメントを目撃した場合の最初の対応は?",
              explanation: "まず相談窓口に報告することが推奨されます。",
              choices: [
                "見て見ぬふりをする",
                "加害者と直接対決する",
                "相談窓口に報告する",
                "SNS で公表する",
              ],
              correct: 2,
            },
            {
              prompt: "予防策として正しいのは?",
              explanation:
                "定期的な研修と相談窓口の周知が効果的です。",
              choices: [
                "問題が起きてから対応する",
                "個人で解決する",
                "定期的な研修と相談窓口の周知",
                "報告は管理職のみで完結させる",
              ],
              correct: 2,
            },
          ]
        : [
            {
              prompt: "強いパスワードの条件として適切なものは?",
              explanation:
                "長さ・文字種の組合せ・推測困難性の 3 点が重要です。",
              choices: [
                "誕生日を含む",
                "12 文字以上で英数記号を組み合わせる",
                "辞書に載っている単語",
                "他のサイトと同じものを使う",
              ],
              correct: 1,
            },
            {
              prompt: "インシデントを発見した時の最初の行動は?",
              explanation:
                "影響範囲を広げないため、まず事象の通報・隔離が優先です。",
              choices: [
                "個人で原因調査する",
                "情報システム部門に通報し対象端末を隔離",
                "とりあえず再起動する",
                "そのまま業務を続ける",
              ],
              correct: 1,
            },
            {
              prompt: "業務で扱う機密情報を持ち出す際の正しい方法は?",
              explanation:
                "承認された手段 (会社支給端末、暗号化ストレージ) のみ使用します。",
              choices: [
                "私物 USB にコピーする",
                "個人メールに転送する",
                "承認された会社支給端末のみで持ち出す",
                "クラウドの個人アカウントに保存する",
              ],
              correct: 2,
            },
          ];

    for (let qi = 0; qi < questionDefs.length; qi++) {
      const q = questionDefs[qi];
      await prisma.question.create({
        data: {
          testId: test.id,
          type: "SINGLE",
          prompt: q.prompt,
          explanation: q.explanation,
          order: qi,
          choices: {
            create: q.choices.map((label, ci) => ({
              label,
              correct: ci === q.correct,
              order: ci,
            })),
          },
        },
      });
    }

    courses.push({ course, lessons });
  }

  // Enrollments: 全 student を Course1, student1 のみ Course2 にも
  const course1 = courses[0].course;
  const course2 = courses[1].course;

  const enrollData: Prisma.EnrollmentCreateManyInput[] = [];
  for (const s of students) {
    enrollData.push({ userId: s.id, courseId: course1.id });
  }
  enrollData.push({ userId: students[0].id, courseId: course2.id });

  for (const data of enrollData) {
    await prisma.enrollment.create({ data });
  }

  // Progress: student1 の Course1 最初の Lesson を completed
  const firstLesson = courses[0].lessons[0];
  await prisma.progress.create({
    data: {
      userId: students[0].id,
      lessonId: firstLesson.id,
      watchedSec: 600,
      lastPositionSec: 600,
      completed: true,
      completedAt: new Date(),
    },
  });

  // eslint-disable-next-line no-console
  console.log("[seed] done", {
    admin: admin.email,
    students: students.map((s) => s.email),
    courses: courses.map((c) => c.course.title),
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
