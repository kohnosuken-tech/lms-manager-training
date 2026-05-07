/**
 * Notion adapter — UserPort 実装
 *
 * キャッシュ: short (30 秒)。
 * env: NOTION_DB_USER
 */

import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type {
  UserPort,
  User,
  CreateUserInput,
  UpdateUserInput,
  ListUsersFilter,
} from "@/server/ports/users";
import { cached, invalidatePrefix } from "./cache";
import { queryAll, createPage, updatePage } from "./db-helpers";
import {
  readRichText,
  readRichTextOrNull,
  readTitle,
  readNumber,
  readCheckbox,
  readSelect,
  readDate,
  readEmail,
  writeTitleProp,
  writeRichTextProp,
  writeNumberProp,
  writeCheckboxProp,
  writeSelectProp,
  writeDateProp,
  writeEmailProp,
} from "./property-mapper";

function dbId(): string {
  const val = process.env.NOTION_DB_USER;
  if (!val) {
    throw new Error(
      "[notion/users] 環境変数 NOTION_DB_USER が設定されていません。",
    );
  }
  return val;
}

function toUser(page: PageObjectResponse): User {
  const p = page.properties;
  const role = readSelect(p["role"]!);
  return {
    id:             readRichText(p["id"]!),
    name:           readTitle(p["name"]!),
    email:          readEmail(p["email"]!),
    role:           (role === "ADMIN" ? "ADMIN" : "STUDENT") as "STUDENT" | "ADMIN",
    passwordHash:   readRichTextOrNull(p["passwordHash"]!),
    clerkUserId:    readRichTextOrNull(p["clerkUserId"]!),
    sessionVersion: readNumber(p["sessionVersion"]!),
    deactivated:    readCheckbox(p["deactivated"]!),
    createdAt:      readDate(p["createdAt"]!),
    updatedAt:      readDate(p["updatedAt"]!),
  };
}

function invalidateUserCache(): void {
  invalidatePrefix("user:");
}

async function listAll(): Promise<User[]> {
  return cached("user:list", "short", async () => {
    const pages = await queryAll(dbId());
    return pages.map(toUser);
  });
}

export const notionUsers: UserPort = {
  async findByEmail(email: string): Promise<User | null> {
    const key = `user:byEmail:${email}`;
    return cached(key, "short", async () => {
      const all = await listAll();
      return all.find((u) => u.email === email) ?? null;
    });
  },

  async findById(id: string): Promise<User | null> {
    const key = `user:byId:${id}`;
    return cached(key, "short", async () => {
      const all = await listAll();
      return all.find((u) => u.id === id) ?? null;
    });
  },

  async list(filter?: ListUsersFilter): Promise<User[]> {
    let all = await listAll();

    if (filter?.role !== undefined) {
      all = all.filter((u) => u.role === filter.role);
    }
    if (filter?.deactivated !== undefined) {
      all = all.filter((u) => u.deactivated === filter.deactivated);
    }
    if (filter?.q) {
      const q = filter.q.toLowerCase();
      all = all.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q),
      );
    }

    return all;
  },

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const page = await createPage(dbId(), {
      name:           writeTitleProp(input.name),
      id:             writeRichTextProp(input.id),
      email:          writeEmailProp(input.email),
      role:           writeSelectProp(input.role),
      passwordHash:   writeRichTextProp(input.passwordHash ?? null),
      clerkUserId:    writeRichTextProp(null),
      sessionVersion: writeNumberProp(0),
      deactivated:    writeCheckboxProp(false),
      createdAt:      writeDateProp(now),
      updatedAt:      writeDateProp(now),
    });

    invalidateUserCache();
    return toUser(page);
  },

  async update(id: string, input: UpdateUserInput): Promise<User> {
    // id でページを検索
    const pages = await queryAll(dbId());
    const target = pages.find((p) => {
      const props = p.properties;
      return readRichText(props["id"]!) === id;
    });
    if (!target) {
      throw new Error(`[notion/users] User not found: id=${id}`);
    }

    const now = new Date().toISOString();
    const updateProps: Record<string, unknown> = {
      updatedAt: writeDateProp(now),
    };

    if (input.name !== undefined)           updateProps["name"]           = writeTitleProp(input.name);
    if (input.email !== undefined)          updateProps["email"]          = writeEmailProp(input.email);
    if (input.role !== undefined)           updateProps["role"]           = writeSelectProp(input.role);
    if (input.passwordHash !== undefined)   updateProps["passwordHash"]   = writeRichTextProp(input.passwordHash);
    if (input.clerkUserId !== undefined)    updateProps["clerkUserId"]    = writeRichTextProp(input.clerkUserId);
    if (input.sessionVersion !== undefined) updateProps["sessionVersion"] = writeNumberProp(input.sessionVersion);
    if (input.deactivated !== undefined)    updateProps["deactivated"]    = writeCheckboxProp(input.deactivated);

    const updated = await updatePage(target.id, updateProps);

    invalidateUserCache();
    return toUser(updated);
  },
};
