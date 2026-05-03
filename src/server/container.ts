// L-3: 起動時の設定検証を必ず実行する
import "./startup-checks";

import type { AuthPort } from "./ports/auth";
import type { AuditPort } from "./ports/audit";
import type { LoggerPort } from "./ports/logger";
import type { MailPort } from "./ports/mail";
import type { StoragePort } from "./ports/storage";
import type { CmsPort } from "./ports/cms";

import { stubAuth } from "./adapters/stub/auth";
import { stubAudit } from "./adapters/stub/audit";
import { stubLogger } from "./adapters/stub/logger";
import { stubMail } from "./adapters/stub/mail";
import { stubStorage } from "./adapters/stub/storage";

import { localCms } from "./adapters/local/cms";
import { spreadsheetCms } from "./adapters/spreadsheet/cms";
import { gasMail } from "./adapters/spreadsheet/mail";

const mode = process.env.APP_MODE ?? "stub";
// "local" (default) | "spreadsheet"
// "sqlite" は deprecated (後方互換で "local" と同義。起動時に warning ログを出す)
const cmsSource = process.env.CMS_SOURCE ?? "local";
const mailDriver = process.env.MAIL_DRIVER ?? "stub"; // "stub" | "gas"

export type Container = {
  auth: AuthPort;
  audit: AuditPort;
  logger: LoggerPort;
  mail: MailPort;
  storage: StoragePort;
  cms: CmsPort;
};

/**
 * prod アダプタが未実装の間は throw する placeholder を生成する。
 * APP_MODE=prod で立ち上げると各アダプタへの最初のアクセス時に落ちるため
 * silent fail を防ぐ (Critical 指摘 H-2 対応)。
 *
 * Phase 4 で Vercel 環境変数が整ったら各 placeholder を
 * src/server/adapters/prod/* の実装に差し替える。
 */
function notImplementedAdapter<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      throw new Error(
        `[Phase4] ${name}.${String(prop)} prod adapter is not implemented yet. ` +
          "Set APP_MODE=stub for local development, or implement the prod adapter.",
      );
    },
  });
}

// CMS_SOURCE=sqlite は deprecated — "local" と同義として扱い warning を出す
if (cmsSource === "sqlite") {
  // eslint-disable-next-line no-console
  console.warn(
    "[container] CMS_SOURCE=sqlite is deprecated. Use CMS_SOURCE=local instead. " +
      "Falling back to localCms (TSV fixture).",
  );
}

const cms: CmsPort =
  cmsSource === "spreadsheet" ? spreadsheetCms : localCms;

const mail: MailPort =
  mode === "prod"
    ? notImplementedAdapter<MailPort>("mail")
    : mailDriver === "gas"
      ? gasMail
      : stubMail;

const prodContainer: Container = {
  auth: notImplementedAdapter<AuthPort>("auth"),
  audit: notImplementedAdapter<AuditPort>("audit"),
  logger: notImplementedAdapter<LoggerPort>("logger"),
  mail: notImplementedAdapter<MailPort>("mail"),
  storage: notImplementedAdapter<StoragePort>("storage"),
  cms,
};

export const container: Container =
  mode === "prod"
    ? prodContainer
    : {
        auth: stubAuth,
        audit: stubAudit,
        logger: stubLogger,
        mail,
        storage: stubStorage,
        cms,
      };
