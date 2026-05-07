/**
 * Notion DB 操作の共通ヘルパー
 *
 * @notionhq/client v5 では databases.query が廃止され、
 * dataSources.query({ data_source_id }) に変更されている。
 * 全アダプタからこのヘルパーを使うことで一元管理する。
 */

import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { Client } from "@notionhq/client";
import { notionRequest } from "./client";

export type SortDirection = "ascending" | "descending";
export type PropertySort = {
  property: string;
  direction: SortDirection;
};

export type QueryOptions = {
  sorts?: PropertySort[];
  page_size?: number;
};

/**
 * Notion DataSource (DB) の全レコードをページネーションして取得する。
 * dataSources.query を使用 (@notionhq/client v5 対応)。
 */
export async function queryAll(
  dataSourceId: string,
  options?: QueryOptions,
): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await notionRequest((c: Client) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c.dataSources as any).query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
        page_size: options?.page_size ?? 100,
        ...(options?.sorts ? { sorts: options.sorts } : {}),
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = res as any;
    const results: unknown[] = result?.results ?? [];
    for (const page of results) {
      if ((page as { object: string }).object === "page") {
        pages.push(page as PageObjectResponse);
      }
    }

    cursor = result?.has_more ? (result.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

/**
 * Notion に新しいページ (レコード) を作成する。
 * pages.create を使用。parent は data_source_id 形式。
 */
export async function createPage(
  dataSourceId: string,
  properties: Record<string, unknown>,
): Promise<PageObjectResponse> {
  const page = await notionRequest((c: Client) =>
    c.pages.create({
      parent: { type: "data_source_id", data_source_id: dataSourceId } as Parameters<typeof c.pages.create>[0]["parent"],
      properties: properties as Parameters<typeof c.pages.create>[0]["properties"],
    }),
  );
  return page as PageObjectResponse;
}

/**
 * 既存のページを更新する。
 * pages.update を使用。
 */
export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>,
): Promise<PageObjectResponse> {
  const page = await notionRequest((c: Client) =>
    c.pages.update({
      page_id: pageId,
      properties: properties as Parameters<typeof c.pages.update>[0]["properties"],
    }),
  );
  return page as PageObjectResponse;
}

/**
 * ページをアーカイブ (論理削除) する。
 */
export async function archivePage(pageId: string): Promise<void> {
  await notionRequest((c: Client) =>
    c.pages.update({
      page_id: pageId,
      in_trash: true,
    }),
  );
}
