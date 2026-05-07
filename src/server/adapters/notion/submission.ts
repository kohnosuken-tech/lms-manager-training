/**
 * Notion adapter — SubmissionPort 実装
 *
 * キャッシュ: none
 * env: NOTION_DB_SUBMISSION
 */

import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type {
  SubmissionPort,
  Submission,
  SubmissionStatus,
  CreateSubmissionInput,
  UpdateSubmissionInput,
} from "@/server/ports/submission";
import { queryAll, createPage, updatePage } from "./db-helpers";
import {
  readRichText,
  readNumber,
  readNumberOrNull,
  readSelect,
  readDate,
  readDateOrNull,
  writeTitleProp,
  writeRichTextProp,
  writeNumberProp,
  writeSelectProp,
  writeDateProp,
} from "./property-mapper";

function dbId(): string {
  const val = process.env.NOTION_DB_SUBMISSION;
  if (!val) throw new Error("[notion/submission] NOTION_DB_SUBMISSION が未設定です。");
  return val;
}

function toSubmission(page: PageObjectResponse): Submission {
  const p = page.properties;
  const status = readSelect(p["status"]!) as SubmissionStatus;
  return {
    id:          readRichText(p["id"]!),
    userId:      readRichText(p["userId"]!),
    testId:      readRichText(p["testId"]!),
    status:      status,
    score:       readNumberOrNull(p["score"]!),
    attemptNo:   readNumber(p["attemptNo"]!),
    startedAt:   readDate(p["startedAt"]!),
    submittedAt: readDateOrNull(p["submittedAt"]!),
  };
}

export const notionSubmission: SubmissionPort = {
  async findById(id: string): Promise<Submission | null> {
    const pages = await queryAll(dbId());
    const page = pages.find((p) => readRichText(p.properties["id"]!) === id);
    return page ? toSubmission(page) : null;
  },

  async findByUserAndTest(
    userId: string,
    testId: string,
    status?: SubmissionStatus,
  ): Promise<Submission[]> {
    const pages = await queryAll(dbId());
    return pages
      .filter((p) => {
        const props = p.properties;
        const matchUser = readRichText(props["userId"]!) === userId;
        const matchTest = readRichText(props["testId"]!) === testId;
        const matchStatus = status === undefined || readSelect(props["status"]!) === status;
        return matchUser && matchTest && matchStatus;
      })
      .map(toSubmission);
  },

  async findInProgress(userId: string, testId: string): Promise<Submission | null> {
    const all = await notionSubmission.findByUserAndTest(userId, testId, "IN_PROGRESS");
    if (all.length === 0) return null;
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  },

  async countFinished(userId: string, testId: string): Promise<number> {
    const pages = await queryAll(dbId());
    return pages.filter((p) => {
      const props = p.properties;
      const matchUser = readRichText(props["userId"]!) === userId;
      const matchTest = readRichText(props["testId"]!) === testId;
      const status = readSelect(props["status"]!);
      const isFinished = status === "PASSED" || status === "FAILED" || status === "ABANDONED";
      return matchUser && matchTest && isFinished;
    }).length;
  },

  async hasPassed(userId: string, testId: string): Promise<boolean> {
    const all = await notionSubmission.findByUserAndTest(userId, testId, "PASSED");
    return all.length > 0;
  },

  async create(input: CreateSubmissionInput): Promise<Submission> {
    const now = new Date().toISOString();
    const name = `${input.userId}:${input.testId}:#${input.attemptNo}`;

    const page = await createPage(dbId(), {
      name:        writeTitleProp(name),
      id:          writeRichTextProp(input.id),
      userId:      writeRichTextProp(input.userId),
      testId:      writeRichTextProp(input.testId),
      status:      writeSelectProp(input.status),
      score:       writeNumberProp(null),
      attemptNo:   writeNumberProp(input.attemptNo),
      startedAt:   writeDateProp(now),
      submittedAt: writeDateProp(null),
    });

    return toSubmission(page);
  },

  async update(id: string, input: UpdateSubmissionInput): Promise<Submission> {
    const pages = await queryAll(dbId());
    const target = pages.find((p) => readRichText(p.properties["id"]!) === id);
    if (!target) throw new Error(`[notion/submission] Submission not found: id=${id}`);

    const updateProps: Record<string, unknown> = {};
    if (input.status !== undefined)      updateProps["status"]      = writeSelectProp(input.status);
    if (input.score !== undefined)       updateProps["score"]       = writeNumberProp(input.score);
    if (input.submittedAt !== undefined) updateProps["submittedAt"] = writeDateProp(input.submittedAt);

    const updated = await updatePage(target.id, updateProps);

    return toSubmission(updated);
  },
};
