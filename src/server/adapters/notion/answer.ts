/**
 * Notion adapter — AnswerPort 実装
 *
 * キャッシュ: none。1 row = 1 choice 設計。
 * env: NOTION_DB_ANSWER
 */

import { randomUUID } from "node:crypto";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type {
  AnswerPort,
  Answer,
  CreateAnswerInput,
} from "@/server/ports/answer";
import { queryAll, createPage, archivePage } from "./db-helpers";
import {
  readRichText,
  readDate,
  writeTitleProp,
  writeRichTextProp,
  writeDateProp,
} from "./property-mapper";

function dbId(): string {
  const val = process.env.NOTION_DB_ANSWER;
  if (!val) throw new Error("[notion/answer] NOTION_DB_ANSWER が未設定です。");
  return val;
}

function toAnswer(page: PageObjectResponse): Answer {
  const p = page.properties;
  return {
    id:           readRichText(p["id"]!),
    submissionId: readRichText(p["submissionId"]!),
    questionId:   readRichText(p["questionId"]!),
    choiceId:     readRichText(p["choiceId"]!),
    createdAt:    readDate(p["createdAt"]!),
  };
}

export const notionAnswer: AnswerPort = {
  async findBySubmission(submissionId: string): Promise<Answer[]> {
    const pages = await queryAll(dbId());
    return pages
      .filter((p) => readRichText(p.properties["submissionId"]!) === submissionId)
      .map(toAnswer);
  },

  async createMany(inputs: CreateAnswerInput[]): Promise<Answer[]> {
    const results: Answer[] = [];
    const now = new Date().toISOString();

    for (const input of inputs) {
      const name = `${input.submissionId}:${input.questionId}`;
      const page = await createPage(dbId(), {
        name:         writeTitleProp(name),
        id:           writeRichTextProp(input.id),
        submissionId: writeRichTextProp(input.submissionId),
        questionId:   writeRichTextProp(input.questionId),
        choiceId:     writeRichTextProp(input.choiceId),
        createdAt:    writeDateProp(now),
      });
      results.push(toAnswer(page));
    }

    return results;
  },

  async deleteBySubmission(submissionId: string): Promise<void> {
    const pages = await queryAll(dbId());
    const targets = pages.filter(
      (p) => readRichText(p.properties["submissionId"]!) === submissionId,
    );

    for (const page of targets) {
      await archivePage(page.id);
    }
  },
};
