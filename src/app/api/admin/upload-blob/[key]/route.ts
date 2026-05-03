import { NextResponse } from "next/server";
import { createWriteStream, unlink } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createHmac, timingSafeEqual } from "node:crypto";
import { container } from "@/server/container";
import { ok, err } from "@/lib/result";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const KEY_PATTERN = /^[\w.\-]+\.mp4$/;

/**
 * public/uploads/ ではなく、Next.js の静的配信から外れた .uploads/ を使う。
 * C-1 対策: public 配下に置かないことで URL 直アクセスによる認可バイパスを防ぐ。
 */
const UPLOADS_DIR = join(process.cwd(), ".uploads");

/** アップロードトークン署名に使う秘密鍵 (SESSION_SECRET を流用。専用 env があれば優先) */
function getSigningKey(): string {
  const key =
    process.env.UPLOAD_SIGNING_SECRET ?? process.env.SESSION_SECRET ?? "";
  if (!key || key.length < 16) {
    throw new Error(
      "UPLOAD_SIGNING_SECRET または SESSION_SECRET が設定されていません。",
    );
  }
  return key;
}

/**
 * アップロードトークンを検証する。
 * upload-url が発行したトークン `<hex-hmac>.<expMs>` を検証し、
 * key 一致と有効期限 (10 分) をチェックする。
 */
function verifyUploadToken(token: string, key: string): boolean {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return false;
    const sig = token.slice(0, dotIdx);
    const expStr = token.slice(dotIdx + 1);
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;

    const signingKey = getSigningKey();
    const expected = createHmac("sha256", signingKey)
      .update(`${key}.${expStr}`)
      .digest("hex");

    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

/** アップロードディレクトリを保証する */
async function ensureUploadsDir(): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

/** ファイルを削除する (エラー時クリーンアップ用、失敗しても握り潰す) */
function removeFile(filePath: string): void {
  unlink(filePath, () => {
    // クリーンアップ失敗は無視
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  // 認可ガード
  let actor;
  try {
    const { requireAdmin } = await import("@/server/auth");
    actor = await requireAdmin();
  } catch {
    return NextResponse.json(
      err("UNAUTHENTICATED", "管理者権限が必要です。"),
      { status: 401 },
    );
  }

  // ------------------------------------------------------------------
  // C-2 対策 1: CSRF — Origin ヘッダが same-origin であることを検証
  // ------------------------------------------------------------------
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(req.url).origin) {
    return NextResponse.json(
      err("FORBIDDEN", "CSRF: Origin が一致しません。"),
      { status: 403 },
    );
  }
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite !== null && secFetchSite !== "same-origin") {
    return NextResponse.json(
      err("FORBIDDEN", "CSRF: Sec-Fetch-Site が same-origin ではありません。"),
      { status: 403 },
    );
  }

  const { key } = await params;

  // key の検証 (path traversal 対策)
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json(
      err("VALIDATION_FAILED", "key が不正です。"),
      { status: 400 },
    );
  }

  // ------------------------------------------------------------------
  // C-2 対策 2: 署名付きトークン検証
  // upload-url が発行した token クエリパラメータを検証する
  // ------------------------------------------------------------------
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token || !verifyUploadToken(token, key)) {
    return NextResponse.json(
      err("FORBIDDEN", "アップロードトークンが無効または期限切れです。"),
      { status: 403 },
    );
  }

  // Content-Length による事前サイズチェック
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!Number.isFinite(contentLength) || contentLength > MAX_BYTES) {
      return NextResponse.json(
        err("FILE_TOO_LARGE", "ファイルサイズは 2 GB 以下にしてください。"),
        { status: 413 },
      );
    }
  }

  // リクエストボディの存在確認
  if (!req.body) {
    return NextResponse.json(
      err("VALIDATION_FAILED", "リクエストボディが空です。"),
      { status: 400 },
    );
  }

  await ensureUploadsDir();

  const filePath = join(UPLOADS_DIR, key);

  // ------------------------------------------------------------------
  // C-2 対策 3: 排他作成 — 既存ファイルの上書きを禁止
  // fs.open の "wx" フラグで既存ファイルが存在する場合は EEXIST で失敗する
  // ------------------------------------------------------------------
  let fileHandle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fileHandle = await open(filePath, "wx");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      return NextResponse.json(
        err("CONFLICT", "同じ key のファイルが既に存在します。"),
        { status: 409 },
      );
    }
    container.logger.error("admin.upload_blob.open_failed", {
      key,
      actorId: actor.id,
      message: code ?? String(e),
    });
    return NextResponse.json(
      err("INTERNAL", "ファイルの作成に失敗しました。"),
      { status: 500 },
    );
  }
  await fileHandle.close();

  const writeStream = createWriteStream(filePath);

  try {
    await new Promise<void>((resolve, reject) => {
      // Web ReadableStream → Node.js Readable に変換
      const nodeReadable = Readable.fromWeb(
        req.body as import("stream/web").ReadableStream<Uint8Array>,
      );

      let bytesWritten = 0;

      nodeReadable.on("data", (chunk: Buffer) => {
        bytesWritten += chunk.length;
        if (bytesWritten > MAX_BYTES) {
          nodeReadable.destroy(new Error("FILE_TOO_LARGE"));
          writeStream.destroy();
          removeFile(filePath);
          reject(new Error("FILE_TOO_LARGE"));
        }
      });

      nodeReadable.pipe(writeStream);

      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      nodeReadable.on("error", reject);
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";

    if (message === "FILE_TOO_LARGE") {
      return NextResponse.json(
        err("FILE_TOO_LARGE", "ファイルサイズは 2 GB 以下にしてください。"),
        { status: 413 },
      );
    }

    container.logger.error("admin.upload_blob.failed", {
      key,
      actorId: actor.id,
      message,
    });

    // 書き込みが途中で失敗した場合は部分ファイルを削除
    removeFile(filePath);

    return NextResponse.json(
      err("INTERNAL", "ファイルの保存に失敗しました。"),
      { status: 500 },
    );
  }

  // DB に保存される blobUrl は /uploads/<key> のまま (video-source.ts の RE_FILE_UPLOADS で判定)
  const blobUrl = `/uploads/${key}`;

  container.logger.info("admin.upload_blob.saved", {
    key,
    actorId: actor.id,
    blobUrl,
  });

  return NextResponse.json(ok({ blobUrl }));
}
