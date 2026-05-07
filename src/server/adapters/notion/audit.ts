/**
 * Notion adapter — AuditPort 実装 (hash chain + mutex)
 *
 * hash chain の手順:
 *   1. mutex.acquire()
 *   2. Notion から最新 AuditLog を 1 件取得 (at 降順)
 *   3. prevHash = last?.hash ?? "genesis"
 *   4. hash を計算
 *   5. Notion に create
 *   6. mutex.release()
 *
 * env: NOTION_DB_AUDIT_LOG
 */

import { randomUUID } from "node:crypto";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { AuditPort, AuditWriteInput } from "@/server/ports/audit";
import { queryAll, createPage } from "./db-helpers";
import { computeAuditHash } from "@/lib/audit-hash";
import {
  readRichText,
  writeTitleProp,
  writeRichTextProp,
  writeDateProp,
} from "./property-mapper";

function dbId(): string {
  const val = process.env.NOTION_DB_AUDIT_LOG;
  if (!val) throw new Error("[notion/audit] NOTION_DB_AUDIT_LOG が未設定です。");
  return val;
}

// ---------- in-memory mutex ----------

let mutexLocked = false;
const mutexQueue: Array<() => void> = [];

async function mutexAcquire(): Promise<() => void> {
  return new Promise<() => void>((resolve) => {
    const tryAcquire = () => {
      if (!mutexLocked) {
        mutexLocked = true;
        resolve(() => {
          mutexLocked = false;
          const next = mutexQueue.shift();
          if (next) next();
        });
      } else {
        mutexQueue.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

// ---------- 最新 AuditLog を 1 件取得 ----------

async function getLatestHash(): Promise<string> {
  const pages = await queryAll(dbId(), {
    sorts: [{ property: "at", direction: "descending" }],
    page_size: 1,
  });

  const page = pages[0];
  if (!page) return "genesis";

  return readRichText((page as PageObjectResponse).properties["hash"]!) || "genesis";
}

// ---------- AuditPort 実装 ----------

export const notionAudit: AuditPort = {
  async write({ actorId, action, target, diff }: AuditWriteInput): Promise<void> {
    const release = await mutexAcquire();

    try {
      const prevHash = await getLatestHash();
      const id = randomUUID();
      const at = new Date();
      const diffStr =
        diff === undefined ? "" : JSON.stringify(diff).slice(0, 2000);

      const hash = computeAuditHash({
        id,
        actorId: actorId ?? null,
        action,
        target: target ?? null,
        diff: diffStr,
        createdAt: at,
        prevHash: prevHash === "genesis" ? null : prevHash,
      });

      const name = `${action}:${target ?? ""}`;

      await createPage(dbId(), {
        name:     writeTitleProp(name),
        id:       writeRichTextProp(id),
        actorId:  writeRichTextProp(actorId ?? null),
        action:   writeRichTextProp(action),
        target:   writeRichTextProp(target ?? null),
        diff:     writeRichTextProp(diffStr),
        prevHash: writeRichTextProp(prevHash),
        hash:     writeRichTextProp(hash),
        at:       writeDateProp(at.toISOString()),
      });
    } finally {
      release();
    }
  },
};
