/**
 * L-3: 起動時の設定検証。
 *
 * モジュールがインポートされた時点で本番環境における危険な設定を検出して即 throw する。
 * Node.js は起動直後にモジュールを評価するため、リクエストが来る前にプロセスが落ちる。
 *
 * このモジュールは container.ts からインポートすることで、アプリ起動時に必ず実行される。
 */

const DEV_SESSION_SECRET = "dev-secret-change-me-32chars-long-please";

if (process.env.NODE_ENV === "production") {
  // SESSION_SECRET がデフォルト dev 値のまま → 即 throw
  if (process.env.SESSION_SECRET === DEV_SESSION_SECRET) {
    throw new Error(
      "[SECURITY] SESSION_SECRET に開発用デフォルト値が使われています。" +
        "本番環境では必ず強力なランダム値に変更してください。",
    );
  }

  // SESSION_SECRET が短すぎる場合も危険
  const sessionSecret = process.env.SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) {
    throw new Error(
      "[SECURITY] SESSION_SECRET が短すぎます (32 文字以上必要)。" +
        "本番環境では十分に長いランダム値を設定してください。",
    );
  }

  // UPLOAD_SIGNING_SECRET が SESSION_SECRET と同じ dev 値なら警告 throw
  const uploadSecret = process.env.UPLOAD_SIGNING_SECRET ?? "";
  if (uploadSecret === DEV_SESSION_SECRET) {
    throw new Error(
      "[SECURITY] UPLOAD_SIGNING_SECRET に開発用デフォルト値が使われています。" +
        "本番環境では必ず強力なランダム値に変更してください。",
    );
  }
}
