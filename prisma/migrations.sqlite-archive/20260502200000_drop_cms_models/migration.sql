-- Phase E: Drop CMS models (Course / Lesson / Test / Question / Choice)
-- These entities are now managed via CmsPort (TSV fixture or Spreadsheet).
-- Enrollment / Progress retain courseId / lessonId as plain string columns.
-- Submission / Answer retain testId / questionId / choiceId as plain string columns.

-- SQLite: disable FK enforcement temporarily to allow safe DROP order
PRAGMA foreign_keys=OFF;

-- Drop index and table: Choice (child of Question)
DROP INDEX IF EXISTS "Choice_questionId_order_idx";
DROP TABLE IF EXISTS "Choice";

-- Drop index and table: Question (child of Test)
DROP INDEX IF EXISTS "Question_testId_order_idx";
DROP TABLE IF EXISTS "Question";

-- Drop index and table: Test (child of Course)
DROP INDEX IF EXISTS "Test_courseId_published_idx";
DROP TABLE IF EXISTS "Test";

-- Drop index and table: Lesson (child of Course)
DROP INDEX IF EXISTS "Lesson_courseId_order_idx";
DROP TABLE IF EXISTS "Lesson";

-- Drop index and table: Course
DROP INDEX IF EXISTS "Course_published_order_idx";
DROP TABLE IF EXISTS "Course";

-- Rebuild Enrollment without Course FK constraint
-- SQLite cannot DROP constraints, so we recreate the table.
CREATE TABLE "Enrollment_new" (
    "id"          TEXT      NOT NULL PRIMARY KEY,
    "userId"      TEXT      NOT NULL,
    "courseId"    TEXT      NOT NULL,
    "assignedAt"  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt"       DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "Enrollment_new" SELECT "id","userId","courseId","assignedAt","dueAt","completedAt" FROM "Enrollment";
DROP TABLE "Enrollment";
ALTER TABLE "Enrollment_new" RENAME TO "Enrollment";
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId","courseId");
CREATE INDEX "Enrollment_userId_completedAt_idx" ON "Enrollment"("userId","completedAt");
CREATE INDEX "Enrollment_courseId_completedAt_idx" ON "Enrollment"("courseId","completedAt");
CREATE INDEX "Enrollment_dueAt_idx" ON "Enrollment"("dueAt");

-- Rebuild Progress without Lesson FK constraint
CREATE TABLE "Progress_new" (
    "id"              TEXT     NOT NULL PRIMARY KEY,
    "userId"          TEXT     NOT NULL,
    "lessonId"        TEXT     NOT NULL,
    "watchedSec"      INTEGER  NOT NULL DEFAULT 0,
    "lastPositionSec" INTEGER  NOT NULL DEFAULT 0,
    "completed"       BOOLEAN  NOT NULL DEFAULT false,
    "completedAt"     DATETIME,
    "updatedAt"       DATETIME NOT NULL,
    CONSTRAINT "Progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "Progress_new" SELECT "id","userId","lessonId","watchedSec","lastPositionSec","completed","completedAt","updatedAt" FROM "Progress";
DROP TABLE "Progress";
ALTER TABLE "Progress_new" RENAME TO "Progress";
CREATE UNIQUE INDEX "Progress_userId_lessonId_key" ON "Progress"("userId","lessonId");
CREATE INDEX "Progress_userId_completed_idx" ON "Progress"("userId","completed");

-- Rebuild Submission without Test FK constraint
CREATE TABLE "Submission_new" (
    "id"          TEXT     NOT NULL PRIMARY KEY,
    "testId"      TEXT     NOT NULL,
    "userId"      TEXT     NOT NULL,
    "status"      TEXT     NOT NULL DEFAULT 'IN_PROGRESS',
    "score"       INTEGER,
    "attemptNo"   INTEGER  NOT NULL DEFAULT 1,
    "startedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "Submission_new" SELECT "id","testId","userId","status","score","attemptNo","startedAt","submittedAt" FROM "Submission";
DROP TABLE "Submission";
ALTER TABLE "Submission_new" RENAME TO "Submission";
CREATE INDEX "Submission_testId_userId_idx" ON "Submission"("testId","userId");
CREATE INDEX "Submission_userId_status_idx" ON "Submission"("userId","status");

-- Rebuild Answer without Question / Choice FK constraints
CREATE TABLE "Answer_new" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "questionId"   TEXT NOT NULL,
    "choiceId"     TEXT NOT NULL,
    CONSTRAINT "Answer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "Answer_new" SELECT "id","submissionId","questionId","choiceId" FROM "Answer";
DROP TABLE "Answer";
ALTER TABLE "Answer_new" RENAME TO "Answer";
CREATE UNIQUE INDEX "Answer_submissionId_questionId_choiceId_key" ON "Answer"("submissionId","questionId","choiceId");
CREATE INDEX "Answer_submissionId_idx" ON "Answer"("submissionId");

PRAGMA foreign_keys=ON;
