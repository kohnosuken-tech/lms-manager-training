import { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";
import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import { AppError } from "@/lib/errors";

export type CreateUserInput = {
  email: string;
  name: string;
  role: Role;
};

export type CreateUserResult = {
  userId: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(
  actorId: string,
  input: CreateUserInput,
): Promise<CreateUserResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (name.length === 0) {
    throw new AppError("VALIDATION_FAILED", "氏名を入力してください。", 422);
  }

  try {
    const created = await prisma.user.create({
      data: { email, name, role: input.role },
      select: { id: true, email: true, name: true, role: true },
    });

    await container.audit.write({
      actorId,
      action: "USER_CREATE",
      target: `User:${created.id}`,
      diff: { email: created.email, name: created.name, role: created.role },
    });

    // 招待メール (モックは console.log)
    await container.mail.send(
      created.email,
      "[LMS] アカウントが発行されました",
      `${created.name} さん、研修管理システムに招待されました。\nログイン後、初回パスワードを設定してください。`,
    );

    container.logger.info("user.create", { actorId, userId: created.id });
    return { userId: created.id };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw new AppError(
        "CONFLICT",
        "そのメールアドレスは既に登録されています。",
        409,
      );
    }
    throw e;
  }
}

export type BulkCreateUsersResult = {
  created: number;
  errors: { line: number; reason: string }[];
};

/**
 * CSV (ヘッダー行 `email,name,role` 必須) を受け取って User を一括作成する。
 * - 1 行ずつ試行。エラー行はスキップして errors に積む。
 * - 既存のメールアドレスは CONFLICT として記録 (作成済みは触らない)。
 */
export async function bulkCreateUsers(
  actorId: string,
  csv: string,
): Promise<BulkCreateUsersResult> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new AppError("VALIDATION_FAILED", "CSV が空です。", 422);
  }

  const header = lines[0]
    .split(",")
    .map((s) => s.trim().toLowerCase());
  const idxEmail = header.indexOf("email");
  const idxName = header.indexOf("name");
  const idxRole = header.indexOf("role");
  if (idxEmail < 0 || idxName < 0 || idxRole < 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      "CSV のヘッダーは `email,name,role` を含めてください。",
      422,
    );
  }
  if (lines.length - 1 > 200) {
    throw new AppError("VALIDATION_FAILED", "一度に登録できるのは 200 件までです。", 422);
  }

  const errors: BulkCreateUsersResult["errors"] = [];
  let created = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((s) => s.trim());
    const email = cells[idxEmail] ?? "";
    const name = cells[idxName] ?? "";
    const role = (cells[idxRole] ?? "").toUpperCase();
    if (!email || !name) {
      errors.push({ line: i + 1, reason: "email または name が空です。" });
      continue;
    }
    if (role !== "STUDENT" && role !== "ADMIN") {
      errors.push({ line: i + 1, reason: "role は STUDENT/ADMIN のみ。" });
      continue;
    }
    try {
      await createUser(actorId, {
        email,
        name,
        role: role as Role,
      });
      created++;
    } catch (e) {
      if (e instanceof AppError) {
        errors.push({ line: i + 1, reason: e.message });
      } else {
        errors.push({ line: i + 1, reason: "想定外のエラー。" });
      }
    }
  }

  return { created, errors };
}

export async function deactivateUser(
  actorId: string,
  userId: string,
  deactivated: boolean,
): Promise<void> {
  if (actorId === userId && deactivated) {
    throw new AppError(
      "VALIDATION_FAILED",
      "自分自身を無効化することはできません。",
      422,
    );
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deactivated: true },
  });
  if (!target) {
    throw new AppError("NOT_FOUND", "対象ユーザーが見つかりません。", 404);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deactivated },
  });

  await container.audit.write({
    actorId,
    action: "USER_DEACTIVATE",
    target: `User:${userId}`,
    diff: { from: target.deactivated, to: deactivated },
  });
}

export async function changeRole(
  actorId: string,
  userId: string,
  role: Role,
): Promise<void> {
  if (actorId === userId && role !== "ADMIN") {
    throw new AppError(
      "VALIDATION_FAILED",
      "自分自身の権限を降格することはできません。",
      422,
    );
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!target) {
    throw new AppError("NOT_FOUND", "対象ユーザーが見つかりません。", 404);
  }
  if (target.role === role) return;

  await prisma.user.update({ where: { id: userId }, data: { role } });

  await container.audit.write({
    actorId,
    action: "ROLE_CHANGE",
    target: `User:${userId}`,
    diff: { from: target.role, to: role },
  });
}
