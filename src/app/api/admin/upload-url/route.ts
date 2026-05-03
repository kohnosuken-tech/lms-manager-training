import { NextResponse } from "next/server";
import { z } from "zod";
import { createHmac } from "node:crypto";
import { container } from "@/server/container";
import { ok, err } from "@/lib/result";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const ALLOWED_TYPES = new Set(["video/mp4"]);

/** トークン有効期間: 10 分 */
const TOKEN_TTL_MS = 10 * 60 * 1000;

const BodySchema = z.object({
  filename: z.string().min(1).max(256),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(0).max(MAX_BYTES),
});

/**
 * アップロードトークンを生成する。
 * トークン形式: `<hex-hmac>.<expMs>`
 * HMAC の入力: `${key}.${expMs}` (key と有効期限を紐付け)
 *
 * C-2 対策: upload-blob がサーバー発行のトークンを検証することで
 * 任意 key でのアップロードを防止する。
 */
function issueUploadToken(key: string): string {
  const signingKey =
    process.env.UPLOAD_SIGNING_SECRET ?? process.env.SESSION_SECRET ?? "";
  if (!signingKey || signingKey.length < 16) {
    throw new Error(
      "UPLOAD_SIGNING_SECRET または SESSION_SECRET が設定されていません。",
    );
  }
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = createHmac("sha256", signingKey)
    .update(`${key}.${exp}`)
    .digest("hex");
  return `${sig}.${exp}`;
}

export async function POST(req: Request) {
  let user;
  try {
    const { requireAdmin } = await import("@/server/auth");
    user = await requireAdmin();
  } catch {
    return NextResponse.json(
      err("UNAUTHENTICATED", "管理者権限が必要です。"),
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      err("VALIDATION_FAILED", "JSON ボディを解析できません。"),
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      err("VALIDATION_FAILED", "入力値が不正です。"),
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.has(parsed.data.contentType)) {
    return NextResponse.json(
      err("VALIDATION_FAILED", "mp4 (video/mp4) のみアップロード可能です。"),
      { status: 422 },
    );
  }

  const result = await container.storage.issueUploadUrl(parsed.data);

  // C-2 対策: サーバーが発行した key にのみ有効な署名トークンを付与する
  // upload-blob は token クエリパラメータを必須検証する
  let uploadUrl: string;
  try {
    const { key } = extractKeyFromUploadUrl(result.uploadUrl);
    const token = issueUploadToken(key);
    uploadUrl = `${result.uploadUrl}?token=${encodeURIComponent(token)}`;
  } catch (e) {
    container.logger.error("admin.upload_url.token_failed", {
      userId: user.id,
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      err("INTERNAL", "アップロード URL の生成に失敗しました。"),
      { status: 500 },
    );
  }

  container.logger.info("admin.upload_url.issued", {
    userId: user.id,
    filename: parsed.data.filename,
    sizeBytes: parsed.data.sizeBytes,
  });
  return NextResponse.json(ok({ ...result, uploadUrl }));
}

/**
 * issueUploadUrl が返す uploadUrl から key を取り出す。
 * 形式: `/api/admin/upload-blob/<key>`
 */
function extractKeyFromUploadUrl(uploadUrl: string): { key: string } {
  const parts = uploadUrl.split("/");
  const key = parts[parts.length - 1];
  if (!key) {
    throw new Error(`uploadUrl から key を抽出できません: ${uploadUrl}`);
  }
  return { key };
}
