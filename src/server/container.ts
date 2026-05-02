import type { AuthPort } from "./ports/auth";
import type { AuditPort } from "./ports/audit";
import type { LoggerPort } from "./ports/logger";
import type { MailPort } from "./ports/mail";
import type { StoragePort } from "./ports/storage";

import { stubAuth } from "./adapters/stub/auth";
import { stubAudit } from "./adapters/stub/audit";
import { stubLogger } from "./adapters/stub/logger";
import { stubMail } from "./adapters/stub/mail";
import { stubStorage } from "./adapters/stub/storage";

const mode = process.env.APP_MODE ?? "stub";

export type Container = {
  auth: AuthPort;
  audit: AuditPort;
  logger: LoggerPort;
  mail: MailPort;
  storage: StoragePort;
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

const prodContainer: Container = {
  auth: notImplementedAdapter<AuthPort>("auth"),
  audit: notImplementedAdapter<AuditPort>("audit"),
  logger: notImplementedAdapter<LoggerPort>("logger"),
  mail: notImplementedAdapter<MailPort>("mail"),
  storage: notImplementedAdapter<StoragePort>("storage"),
};

export const container: Container =
  mode === "prod"
    ? prodContainer
    : {
        auth: stubAuth,
        audit: stubAudit,
        logger: stubLogger,
        mail: stubMail,
        storage: stubStorage,
      };
