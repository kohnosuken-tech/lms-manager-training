/**
 * 動画ソース判定の共通 util
 *
 * Server / Client どちらからも import 可能 (Edge / Node / Browser 共通ロジック)。
 * DB マイグレーション不要 — videoUrl 文字列カラムに格納された値を実行時に判別する。
 */

export type VideoSource =
  | { type: "FILE"; url: string }
  | { type: "YOUTUBE"; videoId: string; embedUrl: string };

// ---------------------------------------------------------------------------
// FILE パターン
// ---------------------------------------------------------------------------

/** /sample.mp4 リテラル */
const RE_FILE_SAMPLE = /^\/sample\.mp4$/;

/** /uploads/<key>.mp4  — key は英数字・ドット・ハイフン・アンダースコアのみ */
const RE_FILE_UPLOADS = /^\/uploads\/[\w.\-]+\.mp4$/;

/** Vercel Blob private/public URL — mp4 拡張子は不問 */
const RE_FILE_BLOB =
  /^https:\/\/[\w-]+\.public\.blob\.vercel-storage\.com\//;

// ---------------------------------------------------------------------------
// YouTube パターン
// ---------------------------------------------------------------------------

/** YouTube 動画 ID は 11 文字の Base64url 文字列 */
const RE_YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

/**
 * YouTube URL から videoId を抽出する。
 * 対応フォーマット:
 *   https://www.youtube.com/watch?v=<id>[&...]
 *   https://youtube.com/watch?v=<id>[&...]
 *   https://youtu.be/<id>[?...]
 *   https://www.youtube.com/embed/<id>[?...]
 *   https://www.youtube-nocookie.com/embed/<id>[?...]
 *
 * 返り値: 正規の 11 文字 videoId、抽出不能なら null
 */
function extractYouTubeId(url: string): string | null {
  // URL.parse / new URL で安全にパース (JavaScript: スキームを弾くため https 限定)
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // https のみ受け付ける
  if (parsed.protocol !== "https:") return null;

  const { hostname, pathname, searchParams } = parsed;

  // パターン 1: youtube.com/watch?v=<id>
  if (
    (hostname === "www.youtube.com" || hostname === "youtube.com") &&
    pathname === "/watch"
  ) {
    const v = searchParams.get("v");
    if (v && RE_YOUTUBE_ID.test(v)) return v;
    return null;
  }

  // パターン 2: youtu.be/<id>
  if (hostname === "youtu.be") {
    const id = pathname.slice(1); // 先頭の "/" を除去
    if (RE_YOUTUBE_ID.test(id)) return id;
    return null;
  }

  // パターン 3: youtube.com/embed/<id> または youtube-nocookie.com/embed/<id>
  if (
    hostname === "www.youtube.com" ||
    hostname === "youtube.com" ||
    hostname === "www.youtube-nocookie.com" ||
    hostname === "youtube-nocookie.com"
  ) {
    const match = pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})(\/|$)/);
    if (match) return match[1];
    return null;
  }

  return null;
}

/**
 * 正規の embed URL を生成する。
 *
 * youtube-nocookie.com を使う理由:
 *   - Cookie を設定しないプライバシー強化モード。GDPR/個人情報保護の観点で
 *     ユーザー追跡リスクを低減できる。
 * rel=0 の理由:
 *   - 動画終了後に表示される関連動画を同一チャンネルのみに制限し、
 *     受講者が意図しない外部コンテンツへ誘導されることを防ぐ。
 * modestbranding=1 の理由:
 *   - プレーヤー上の YouTube ロゴを最小化し、研修 UI から受講者の注意が
 *     逸れることを抑制する。
 * enablejsapi=1 の理由:
 *   - IFrame Player API を有効化し、将来的に視聴位置取得・再生イベント検知を
 *     サーバーへ送信できるようにする布石。
 */
function buildEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * url が許可された動画ソースなら VideoSource を返す。不正なら null。
 */
export function parseVideoSource(url: string): VideoSource | null {
  if (typeof url !== "string") return null;

  // ---- FILE 判定 ----
  if (RE_FILE_SAMPLE.test(url) || RE_FILE_UPLOADS.test(url)) {
    return { type: "FILE", url };
  }
  if (RE_FILE_BLOB.test(url)) {
    return { type: "FILE", url };
  }

  // ---- YOUTUBE 判定 ----
  const videoId = extractYouTubeId(url);
  if (videoId !== null) {
    return {
      type: "YOUTUBE",
      videoId,
      embedUrl: buildEmbedUrl(videoId),
    };
  }

  return null;
}

/**
 * 入力検証用ヘルパ。動画 URL として許容されるパターンか。
 * zod の refine に渡す想定。
 */
export function isValidVideoUrl(url: string): boolean {
  return parseVideoSource(url) !== null;
}
