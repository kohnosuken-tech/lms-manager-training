// L-3: 起動時の設定検証を必ず実行する
import "./startup-checks";

import type { AuthPort } from "./ports/auth";
import type { AuditPort } from "./ports/audit";
import type { LoggerPort } from "./ports/logger";
import type { MailPort } from "./ports/mail";
import type { StoragePort } from "./ports/storage";
import type { CmsPort } from "./ports/cms";
import type { UserPort } from "./ports/users";
import type { EnrollmentPort } from "./ports/enrollment";
import type { ProgressPort } from "./ports/progress";
import type { SubmissionPort } from "./ports/submission";
import type { AnswerPort } from "./ports/answer";

import { stubAuth } from "./adapters/stub/auth";
import { stubAudit } from "./adapters/stub/audit";
import { stubLogger } from "./adapters/stub/logger";
import { stubMail } from "./adapters/stub/mail";
import { stubStorage } from "./adapters/stub/storage";

import { localCms } from "./adapters/local/cms";
import { spreadsheetCms } from "./adapters/spreadsheet/cms";
import { gasMail } from "./adapters/spreadsheet/mail";

import { notionCms } from "./adapters/notion/cms";
import { notionUsers } from "./adapters/notion/users";
import { notionEnrollment } from "./adapters/notion/enrollment";
import { notionProgress } from "./adapters/notion/progress";
import { notionSubmission } from "./adapters/notion/submission";
import { notionAnswer } from "./adapters/notion/answer";
import { notionAudit } from "./adapters/notion/audit";

const mode = process.env.APP_MODE ?? "stub";

// DATA_DRIVER: "notion" | "sqlite-spreadsheet" (default)
const dataDriver = process.env.DATA_DRIVER ?? "sqlite-spreadsheet";

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
  // 新規 ports (Notion adapter で実装。sqlite-spreadsheet モードでは null)
  users: UserPort | null;
  enrollment: EnrollmentPort | null;
  progress: ProgressPort | null;
  submission: SubmissionPort | null;
  answer: AnswerPort | null;
};

/**
 * prod アダプタが未実装の間は throw する placeholder を生成する。
 * APP_MODE=prod で立ち上げると各アダプタへの最初のアクセス時に落ちるため
 * silent fail を防ぐ (Critical 指摘 H-2 対応)。
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

function buildContainer(): Container {
  // ---------- notion モード ----------
  if (dataDriver === "notion") {
    const notionMail: MailPort = mailDriver === "gas" ? gasMail : stubMail;
    return {
      auth:       mode === "prod" ? notImplementedAdapter<AuthPort>("auth") : stubAuth,
      audit:      notionAudit,
      logger:     mode === "prod" ? notImplementedAdapter<LoggerPort>("logger") : stubLogger,
      mail:       notionMail,
      storage:    mode === "prod" ? notImplementedAdapter<StoragePort>("storage") : stubStorage,
      cms:        notionCms,
      users:      notionUsers,
      enrollment: notionEnrollment,
      progress:   notionProgress,
      submission: notionSubmission,
      answer:     notionAnswer,
    };
  }

  // ---------- sqlite-spreadsheet モード (既存 / デフォルト) ----------
  const cms: CmsPort =
    cmsSource === "spreadsheet" ? spreadsheetCms : localCms;

  const mail: MailPort =
    mode === "prod"
      ? notImplementedAdapter<MailPort>("mail")
      : mailDriver === "gas"
        ? gasMail
        : stubMail;

  if (mode === "prod") {
    return {
      auth:       notImplementedAdapter<AuthPort>("auth"),
      audit:      notImplementedAdapter<AuditPort>("audit"),
      logger:     notImplementedAdapter<LoggerPort>("logger"),
      mail:       notImplementedAdapter<MailPort>("mail"),
      storage:    notImplementedAdapter<StoragePort>("storage"),
      cms,
      users:      null,
      enrollment: null,
      progress:   null,
      submission: null,
      answer:     null,
    };
  }

  return {
    auth:       stubAuth,
    audit:      stubAudit,
    logger:     stubLogger,
    mail,
    storage:    stubStorage,
    cms,
    users:      null,
    enrollment: null,
    progress:   null,
    submission: null,
    answer:     null,
  };
}

export const container: Container = buildContainer();
