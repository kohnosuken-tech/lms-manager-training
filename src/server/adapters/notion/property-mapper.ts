/**
 * Notion property ⇔ DTO 変換ユーティリティ
 *
 * Notion API の response は deeply nested なので、ここで平坦化する。
 * 書き込み用の property オブジェクトも構築する。
 */

import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

type NotionProperty = PageObjectResponse["properties"][string];

// ---------- 読み取り ----------

export function readTitle(prop: NotionProperty): string {
  if (prop.type !== "title") return "";
  return prop.title.map((t) => t.plain_text).join("") ?? "";
}

export function readRichText(prop: NotionProperty): string {
  if (prop.type !== "rich_text") return "";
  return prop.rich_text.map((t) => t.plain_text).join("") ?? "";
}

export function readRichTextOrNull(prop: NotionProperty): string | null {
  if (prop.type !== "rich_text") return null;
  const text = prop.rich_text.map((t) => t.plain_text).join("");
  return text === "" ? null : text;
}

export function readNumber(prop: NotionProperty): number {
  if (prop.type !== "number") return 0;
  return prop.number ?? 0;
}

export function readNumberOrNull(prop: NotionProperty): number | null {
  if (prop.type !== "number") return null;
  return prop.number ?? null;
}

export function readCheckbox(prop: NotionProperty): boolean {
  if (prop.type !== "checkbox") return false;
  return prop.checkbox;
}

export function readSelect(prop: NotionProperty): string {
  if (prop.type !== "select") return "";
  return prop.select?.name ?? "";
}

export function readSelectOrNull(prop: NotionProperty): string | null {
  if (prop.type !== "select") return null;
  return prop.select?.name ?? null;
}

export function readDate(prop: NotionProperty): string {
  if (prop.type !== "date") return new Date(0).toISOString();
  return prop.date?.start ?? new Date(0).toISOString();
}

export function readDateOrNull(prop: NotionProperty): string | null {
  if (prop.type !== "date") return null;
  return prop.date?.start ?? null;
}

export function readEmail(prop: NotionProperty): string {
  if (prop.type !== "email") return "";
  return prop.email ?? "";
}

export function readUrl(prop: NotionProperty): string {
  if (prop.type !== "url") return "";
  return prop.url ?? "";
}

// ---------- 書き込み ----------

export function writeTitleProp(value: string) {
  return {
    title: [{ text: { content: value } }],
  };
}

export function writeRichTextProp(value: string | null | undefined) {
  return {
    rich_text: [{ text: { content: value ?? "" } }],
  };
}

export function writeNumberProp(value: number | null | undefined) {
  return {
    number: value ?? null,
  };
}

export function writeCheckboxProp(value: boolean) {
  return {
    checkbox: value,
  };
}

export function writeSelectProp(value: string | null | undefined) {
  if (!value) return { select: null };
  return {
    select: { name: value },
  };
}

export function writeDateProp(value: string | null | undefined) {
  if (!value) return { date: null };
  return {
    date: { start: value },
  };
}

export function writeEmailProp(value: string | null | undefined) {
  return {
    email: value ?? null,
  };
}

export function writeUrlProp(value: string | null | undefined) {
  return {
    url: value ?? null,
  };
}
