"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import {
  createUser,
  bulkCreateUsers,
  deactivateUser,
  changeRole,
  type BulkCreateUsersResult,
} from "@/server/services/user";
import { AppError } from "@/lib/errors";
import { ok, err, type ApiResult } from "@/lib/result";

const RoleEnum = z.enum(["STUDENT", "ADMIN"]);

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: RoleEnum,
});

export type CreateUserActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: { email?: string; name?: string; role?: "STUDENT" | "ADMIN" };
  successMessage?: string;
};

export async function createUserAction(
  _prev: CreateUserActionState | undefined,
  formData: FormData,
): Promise<CreateUserActionState> {
  const actor = await requireAdmin();
  const raw = {
    email: String(formData.get("email") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    role: String(formData.get("role") ?? "STUDENT").trim(),
  };
  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: "入力値が不正です。",
      values: { email: raw.email, name: raw.name, role: raw.role as "STUDENT" | "ADMIN" },
    };
  }

  try {
    await createUser(actor.id, parsed.data);
    revalidatePath("/admin/users");
    return { successMessage: `${parsed.data.name} を作成しました。` };
  } catch (e) {
    if (e instanceof AppError) {
      return {
        error: e.message,
        values: parsed.data,
      };
    }
    return {
      error: "ユーザー作成に失敗しました。",
      values: parsed.data,
    };
  }
}

const BulkSchema = z.object({ csv: z.string().min(1).max(64_000) });

export type BulkCreateUsersActionState = {
  error?: string;
  result?: BulkCreateUsersResult;
};

export async function bulkCreateUsersAction(
  _prev: BulkCreateUsersActionState | undefined,
  formData: FormData,
): Promise<BulkCreateUsersActionState> {
  const actor = await requireAdmin();
  const parsed = BulkSchema.safeParse({
    csv: String(formData.get("csv") ?? ""),
  });
  if (!parsed.success) {
    return { error: "CSV を入力してください。" };
  }
  try {
    const result = await bulkCreateUsers(actor.id, parsed.data.csv);
    revalidatePath("/admin/users");
    return { result };
  } catch (e) {
    if (e instanceof AppError) {
      return { error: e.message };
    }
    return { error: "一括登録に失敗しました。" };
  }
}

const DeactivateSchema = z.object({
  userId: z.string().min(1),
  deactivated: z.enum(["true", "false"]),
});

export async function deactivateUserAction(
  formData: FormData,
): Promise<ApiResult<null>> {
  const actor = await requireAdmin();
  const parsed = DeactivateSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    deactivated: String(formData.get("deactivated") ?? ""),
  });
  if (!parsed.success) return err("VALIDATION_FAILED", "入力値が不正です。");
  try {
    await deactivateUser(
      actor.id,
      parsed.data.userId,
      parsed.data.deactivated === "true",
    );
    revalidatePath("/admin/users");
    return ok(null);
  } catch (e) {
    if (e instanceof AppError) return err(e.code, e.message);
    return err("INTERNAL", "更新に失敗しました。");
  }
}

const ChangeRoleSchema = z.object({
  userId: z.string().min(1),
  role: RoleEnum,
});

export async function changeRoleAction(
  formData: FormData,
): Promise<ApiResult<null>> {
  const actor = await requireAdmin();
  const parsed = ChangeRoleSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    role: String(formData.get("role") ?? ""),
  });
  if (!parsed.success) return err("VALIDATION_FAILED", "入力値が不正です。");
  try {
    await changeRole(actor.id, parsed.data.userId, parsed.data.role);
    revalidatePath("/admin/users");
    return ok(null);
  } catch (e) {
    if (e instanceof AppError) return err(e.code, e.message);
    return err("INTERNAL", "更新に失敗しました。");
  }
}
