/**
 * prod storage adapter — Vercel Blob 実装 (Phase 4 TODO)
 *
 * 実装手順:
 * 1. `pnpm add @vercel/blob` を実行する
 * 2. Vercel ダッシュボードで Blob storage を作成し、
 *    BLOB_READ_WRITE_TOKEN を auto-inject させる
 * 3. 動画は private モードでアップロードし、署名付き URL を発行する
 * 4. 下記 TODO コメントを実際の @vercel/blob 呼び出しに置き換える
 */

import type {
  StoragePort,
  IssueUploadUrlInput,
  IssueUploadUrlResult,
} from "@/server/ports/storage";

// TODO(Phase4): import { put, head } from "@vercel/blob";

export const prodStorage: StoragePort = {
  async issueUploadUrl(
    _input: IssueUploadUrlInput,
  ): Promise<IssueUploadUrlResult> {
    // TODO(Phase4):
    // 1. MIME / サイズ検証を行う (video/mp4 のみ許可、上限は設計に従う)
    // 2. @vercel/blob の handleUpload (client upload) または
    //    put (server upload) で署名付きアップロード URL を発行する
    // 3. private モードを使い、blobUrl は署名付き URL で返す
    //
    // 実装例 (client upload の場合):
    //   const { url, clientPayload } = await handleUpload({ ... });
    throw new Error("[Phase4] prodStorage.issueUploadUrl is not implemented.");
  },

  async resolveVideoUrl(_key: string): Promise<string> {
    // TODO(Phase4):
    // 1. @vercel/blob の `head(key)` でメタデータを取得する
    // 2. private blob の場合は署名付きダウンロード URL を生成して返す
    //    (Blob の generateClientTokenFromReadWriteToken 等を使う)
    //
    // 実装例:
    //   const { downloadUrl } = await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
    //   return downloadUrl;
    throw new Error("[Phase4] prodStorage.resolveVideoUrl is not implemented.");
  },
};
