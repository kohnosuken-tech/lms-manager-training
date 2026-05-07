/**
 * Notion adapter — EnrollmentPort 実装
 *
 * キャッシュ: short (30 秒)。
 * env: NOTION_DB_ENROLLMENT
 */

import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type {
  EnrollmentPort,
  Enrollment,
  CreateEnrollmentInput,
  UpdateEnrollmentInput,
} from "@/server/ports/enrollment";
import { cached, invalidatePrefix } from "./cache";
import { queryAll, createPage, updatePage, archivePage } from "./db-helpers";
import {
  readRichText,
  readTitle,
  readDate,
  readDateOrNull,
  writeTitleProp,
  writeRichTextProp,
  writeDateProp,
} from "./property-mapper";

function dbId(): string {
  const val = process.env.NOTION_DB_ENROLLMENT;
  if (!val) throw new Error("[notion/enrollment] NOTION_DB_ENROLLMENT が未設定です。");
  return val;
}

function toEnrollment(page: PageObjectResponse): Enrollment {
  const p = page.properties;
  return {
    id:          readRichText(p["id"]!),
    userId:      readRichText(p["userId"]!),
    courseId:    readRichText(p["courseId"]!),
    assignedAt:  readDate(p["assignedAt"]!),
    dueAt:       readDateOrNull(p["dueAt"]!),
    completedAt: readDateOrNull(p["completedAt"]!),
  };
}

function invalidate(): void {
  invalidatePrefix("enrollment:");
}

async function listAll(): Promise<Enrollment[]> {
  return cached("enrollment:list", "short", async () => {
    const pages = await queryAll(dbId());
    return pages.map(toEnrollment);
  });
}

export const notionEnrollment: EnrollmentPort = {
  async findByUserAndCourse(userId: string, courseId: string): Promise<Enrollment | null> {
    const all = await listAll();
    return all.find((e) => e.userId === userId && e.courseId === courseId) ?? null;
  },

  async findByUser(userId: string): Promise<Enrollment[]> {
    const all = await listAll();
    return all.filter((e) => e.userId === userId);
  },

  async findByCourse(courseId: string): Promise<Enrollment[]> {
    const all = await listAll();
    return all.filter((e) => e.courseId === courseId);
  },

  async findAll(): Promise<Enrollment[]> {
    return listAll();
  },

  async create(input: CreateEnrollmentInput): Promise<Enrollment> {
    const now = new Date().toISOString();
    const name = `${input.userId}:${input.courseId}`;

    const page = await createPage(dbId(), {
      name:        writeTitleProp(name),
      id:          writeRichTextProp(input.id),
      userId:      writeRichTextProp(input.userId),
      courseId:    writeRichTextProp(input.courseId),
      assignedAt:  writeDateProp(now),
      dueAt:       writeDateProp(input.dueAt ?? null),
      completedAt: writeDateProp(null),
    });

    invalidate();
    return toEnrollment(page);
  },

  async update(id: string, input: UpdateEnrollmentInput): Promise<Enrollment> {
    const pages = await queryAll(dbId());
    const target = pages.find((p) => readRichText(p.properties["id"]!) === id);
    if (!target) throw new Error(`[notion/enrollment] Enrollment not found: id=${id}`);

    const updateProps: Record<string, unknown> = {};
    if (input.dueAt !== undefined)       updateProps["dueAt"]       = writeDateProp(input.dueAt);
    if (input.completedAt !== undefined) updateProps["completedAt"] = writeDateProp(input.completedAt);

    const updated = await updatePage(target.id, updateProps);

    invalidate();
    return toEnrollment(updated);
  },

  async delete(id: string): Promise<void> {
    const pages = await queryAll(dbId());
    const target = pages.find((p) => readRichText(p.properties["id"]!) === id);
    if (!target) return;

    await archivePage(target.id);
    invalidate();
  },
};
