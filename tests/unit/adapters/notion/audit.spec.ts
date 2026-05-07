/**
 * notion/audit.ts のユニットテスト
 *
 * hash chain が正しく維持されることを mock Notion responses で検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/adapters/notion/client", () => ({
  notionRequest: vi.fn(),
}));

import { notionRequest } from "@/server/adapters/notion/client";
import { notionAudit } from "@/server/adapters/notion/audit";
import { computeAuditHash } from "@/lib/audit-hash";

const mockRequest = vi.mocked(notionRequest);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOTION_DB_AUDIT_LOG = "test-audit-db-id";
});

function makeRichText(value: string) {
  return { type: "rich_text", rich_text: [{ plain_text: value }] };
}
function makeTitle(value: string) {
  return { type: "title", title: [{ plain_text: value }] };
}
function makeDate(value: string) {
  return { type: "date", date: { start: value } };
}

describe("notionAudit.write()", () => {
  it("最初の書き込みで prevHash=genesis を使う", async () => {
    // query: 0 件 (最初のレコード)
    mockRequest.mockResolvedValueOnce({
      results: [],
      has_more: false,
      next_cursor: null,
    });

    // create の呼び出し
    let createdProps: Record<string, unknown> | null = null;
    mockRequest.mockImplementationOnce(async (fn) => {
      const fakeClient = {
        pages: {
          create: (params: { properties: Record<string, unknown> }) => {
            createdProps = params.properties;
            return Promise.resolve({ id: "new-page-id", object: "page", properties: params.properties });
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fn(fakeClient as any);
    });

    await notionAudit.write({
      actorId: "user-1",
      action: "USER_CREATE",
      target: "User:user-1",
      diff: { userId: "user-1" },
    });

    expect(createdProps).not.toBeNull();
    // prevHash は "genesis" のはず
    const prevHashProp = createdProps!["prevHash"] as { rich_text: { text: { content: string } }[] };
    expect(prevHashProp.rich_text[0]?.text.content).toBe("genesis");
  });

  it("既存レコードがある場合は直前の hash を prevHash として使う", async () => {
    const prevHash = "abc123prevhash";

    // query: 1 件返す (直前レコード)
    mockRequest.mockResolvedValueOnce({
      results: [
        {
          object: "page",
          id: "prev-page-id",
          properties: {
            name:     makeTitle("USER_CREATE:User:old-user"),
            id:       makeRichText("prev-audit-id"),
            actorId:  makeRichText("old-actor"),
            action:   makeRichText("USER_CREATE"),
            target:   makeRichText("User:old-user"),
            diff:     makeRichText(""),
            prevHash: makeRichText("genesis"),
            hash:     makeRichText(prevHash),
            at:       makeDate("2024-01-01T00:00:00.000Z"),
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    });

    let createdProps: Record<string, unknown> | null = null;
    mockRequest.mockImplementationOnce(async (fn) => {
      const fakeClient = {
        pages: {
          create: (params: { properties: Record<string, unknown> }) => {
            createdProps = params.properties;
            return Promise.resolve({ id: "new-page-id", object: "page", properties: params.properties });
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fn(fakeClient as any);
    });

    await notionAudit.write({
      actorId: "user-2",
      action: "ROLE_CHANGE",
      target: "User:user-2",
    });

    expect(createdProps).not.toBeNull();
    // prevHash が直前レコードの hash を使っていること
    const prevHashProp = createdProps!["prevHash"] as { rich_text: { text: { content: string } }[] };
    expect(prevHashProp.rich_text[0]?.text.content).toBe(prevHash);
  });

  it("hash が prevHash + payload の SHA-256 になっている", async () => {
    const prevHash = "genesis";

    mockRequest.mockResolvedValueOnce({
      results: [],
      has_more: false,
      next_cursor: null,
    });

    let capturedProps: Record<string, unknown> | null = null;
    let capturedAt: Date | null = null;

    mockRequest.mockImplementationOnce(async (fn) => {
      const fakeClient = {
        pages: {
          create: (params: { properties: Record<string, unknown> }) => {
            capturedProps = params.properties;
            // at を抽出
            const atProp = params.properties["at"] as { date: { start: string } };
            capturedAt = new Date(atProp.date.start);
            return Promise.resolve({ id: "new-page-id", object: "page", properties: params.properties });
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fn(fakeClient as any);
    });

    await notionAudit.write({
      actorId: "user-3",
      action: "USER_LOGIN",
      target: "User:user-3",
      diff: { success: true },
    });

    expect(capturedProps).not.toBeNull();

    const hashProp = capturedProps!["hash"] as { rich_text: { text: { content: string } }[] };
    const idProp = capturedProps!["id"] as { rich_text: { text: { content: string } }[] };

    const capturedHash = hashProp.rich_text[0]?.text.content ?? "";
    const capturedId = idProp.rich_text[0]?.text.content ?? "";

    // 期待する hash を計算
    const expectedHash = computeAuditHash({
      id: capturedId,
      actorId: "user-3",
      action: "USER_LOGIN",
      target: "User:user-3",
      diff: JSON.stringify({ success: true }),
      createdAt: capturedAt!,
      prevHash: null, // genesis の場合は null
    });

    expect(capturedHash).toBe(expectedHash);
  });

  it("diff が 2000 文字に切り詰められる", async () => {
    mockRequest.mockResolvedValueOnce({
      results: [],
      has_more: false,
      next_cursor: null,
    });

    let capturedProps: Record<string, unknown> | null = null;
    mockRequest.mockImplementationOnce(async (fn) => {
      const fakeClient = {
        pages: {
          create: (params: { properties: Record<string, unknown> }) => {
            capturedProps = params.properties;
            return Promise.resolve({ id: "new-page-id", object: "page", properties: params.properties });
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fn(fakeClient as any);
    });

    const longDiff = { data: "x".repeat(3000) };
    await notionAudit.write({
      actorId: "user-4",
      action: "EXPORT_CSV",
      diff: longDiff,
    });

    const diffProp = capturedProps!["diff"] as { rich_text: { text: { content: string } }[] };
    const diffStr = diffProp.rich_text[0]?.text.content ?? "";
    expect(diffStr.length).toBeLessThanOrEqual(2000);
  });
});
