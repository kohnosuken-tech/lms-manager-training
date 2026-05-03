"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// YouTube IFrame Player API type stubs
// (公式 @types/youtube を入れない場合の最小型定義)
// ---------------------------------------------------------------------------

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  destroy(): void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data?: number;
}

interface YTPlayerOptions {
  events?: {
    onReady?: (event: YTPlayerEvent) => void;
    onStateChange?: (event: YTPlayerEvent) => void;
    onError?: (event: YTPlayerEvent) => void;
  };
}

// YT.PlayerState の定数
const YT_PLAYING = 1;
const YT_ENDED = 0;

// window に生えるグローバル
declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLIFrameElement | string,
        opts: YTPlayerOptions,
      ) => YTPlayer;
      PlayerState: Record<string, number>;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const SAVE_INTERVAL_MS = 10_000; // FILE と同じ 10 秒
const SEEK_TOLERANCE_SEC = 5;
/** 連続失敗がこの回数に達したら「オフラインモード」警告を表示 */
const OFFLINE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type YouTubePlayerProps = {
  lessonId: string;
  videoId: string;
  embedUrl: string;
  durationSec: number;
  blockSeek: boolean;
  requiredCompletionRate: number;
  initialWatchedSec: number;
  initialLastPositionSec: number;
  initialCompleted: boolean;
  onProgress?: (watchedSec: number, lastPositionSec: number) => void;
  onCompleted?: () => void;
};

// ---------------------------------------------------------------------------
// 進捗保存レスポンス型 (VideoPlayer と共通スキーマ)
// ---------------------------------------------------------------------------

type SaveResponse =
  | { ok: true; data: { completed: boolean } }
  | { ok: false; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// 時刻フォーマット
// ---------------------------------------------------------------------------

function formatTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// IFrame API ロードユーティリティ
// 複数コンポーネントが同一ページに存在する場合でも script を二重追加しない。
// ---------------------------------------------------------------------------

type ReadyCallback = () => void;

const apiCallbacks: ReadyCallback[] = [];
let apiLoaded = false;

function loadYouTubeIframeAPI(onReady: ReadyCallback): void {
  if (apiLoaded) {
    // API が既にロード済みなら即コール
    onReady();
    return;
  }

  apiCallbacks.push(onReady);

  // script タグが既に挿入済みなら待つだけ
  if (document.getElementById("yt-iframe-api")) return;

  // グローバルフックを設定 (既存の onYouTubeIframeAPIReady を上書きしないよう防御)
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    apiLoaded = true;
    prev?.();
    for (const cb of apiCallbacks.splice(0)) {
      cb();
    }
  };

  const script = document.createElement("script");
  script.id = "yt-iframe-api";
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  document.head.appendChild(script);
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function YouTubePlayer({
  lessonId,
  videoId,
  embedUrl,
  durationSec,
  blockSeek,
  requiredCompletionRate,
  initialWatchedSec,
  initialLastPositionSec,
  initialCompleted,
  onProgress,
  onCompleted,
}: YouTubePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 進捗状態 (単調増加)
  const watchedSecRef = useRef<number>(initialWatchedSec);
  const lastPositionSecRef = useRef<number>(initialLastPositionSec);
  const maxAllowedPositionRef = useRef<number>(initialLastPositionSec);
  const completedRef = useRef<boolean>(initialCompleted);
  const dirtyRef = useRef<boolean>(false);

  // 表示用 state
  const [watchedSec, setWatchedSec] = useState(initialWatchedSec);
  const [completed, setCompleted] = useState(initialCompleted);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [apiLoadError, setApiLoadError] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  // 連続ネットワーク失敗カウンタ
  const consecutiveFailRef = useRef<number>(0);

  // durationSec が 0 の場合は IFrame から取得する
  const [resolvedDuration, setResolvedDuration] = useState(
    durationSec > 0 ? durationSec : 0,
  );

  // ---------------------------------------------------------------------------
  // 進捗保存
  // ---------------------------------------------------------------------------

  const saveProgress = useCallback(
    async (
      w: number,
      p: number,
      opts?: { keepalive?: boolean },
    ): Promise<void> => {
      try {
        const res = await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            watchedSec: Math.floor(w),
            lastPositionSec: Math.floor(p),
          }),
          keepalive: opts?.keepalive ?? false,
        });
        const json = (await res.json()) as SaveResponse;
        if (!json.ok) {
          if (json.error.code === "SEEK_BLOCKED") {
            setErrorMessage(
              "前方シークは禁止されています。視聴済み位置に戻します。",
            );
          } else {
            setErrorMessage(json.error.message);
          }
          return;
        }
        dirtyRef.current = false;
        consecutiveFailRef.current = 0;
        setOfflineMode(false);
        if (json.data.completed && !completedRef.current) {
          completedRef.current = true;
          setCompleted(true);
          onCompleted?.();
        }
      } catch {
        // ネットワークエラー: 連続失敗カウントを更新して警告表示
        consecutiveFailRef.current += 1;
        if (consecutiveFailRef.current >= OFFLINE_THRESHOLD) {
          setOfflineMode(true);
          setErrorMessage(
            "進捗の保存に失敗しました。接続を確認してください。(オフラインモード)",
          );
        } else {
          setErrorMessage("進捗の保存に失敗しました。接続を確認してください。");
        }
      }
    },
    [lessonId, onCompleted],
  );

  // ---------------------------------------------------------------------------
  // 定期保存インターバル
  // ---------------------------------------------------------------------------

  const startInterval = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      if (!dirtyRef.current) return;
      void saveProgress(watchedSecRef.current, lastPositionSecRef.current);
    }, SAVE_INTERVAL_MS);
  }, [saveProgress]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // IFrame Player API 初期化
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let destroyed = false;

    loadYouTubeIframeAPI(() => {
      if (destroyed) return;
      if (!window.YT) {
        setApiLoadError(true);
        return;
      }

      try {
        const player = new window.YT.Player(iframe, {
          events: {
            onReady: (ev) => {
              if (destroyed) return;
              setApiReady(true);
              // duration を取得 (durationSec が 0 のとき)
              const dur = ev.target.getDuration();
              if (dur > 0) {
                setResolvedDuration(dur);
              }
              // 前回の視聴位置に移動
              if (initialLastPositionSec > 0) {
                ev.target.seekTo(initialLastPositionSec, true);
              }
            },
            onStateChange: (ev) => {
              if (destroyed) return;
              const state = ev.data ?? -1;

              if (state === YT_PLAYING) {
                startInterval();
              } else {
                stopInterval();
                // 一時停止/終了時に現在位置を記録
                const pos = ev.target.getCurrentTime();
                lastPositionSecRef.current = pos;
              }

              if (state === YT_ENDED) {
                // 動画終了: 最終位置 = duration
                const dur = ev.target.getDuration();
                const finalPos = dur > 0 ? dur : resolvedDuration;
                const finalWatched = Math.max(
                  watchedSecRef.current,
                  finalPos,
                );
                watchedSecRef.current = finalWatched;
                lastPositionSecRef.current = finalPos;
                setWatchedSec(finalWatched);
                dirtyRef.current = true;
                void saveProgress(finalWatched, finalPos);
              }
            },
            onError: () => {
              if (destroyed) return;
              setApiLoadError(true);
            },
          },
        });
        playerRef.current = player;
      } catch {
        setApiLoadError(true);
      }
    });

    return () => {
      destroyed = true;
      stopInterval();
      if (dirtyRef.current) {
        void saveProgress(
          watchedSecRef.current,
          lastPositionSecRef.current,
          { keepalive: true },
        );
      }
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // 再生中の currentTime ポーリング
  // (IFrame API の ontimeupdate 相当がないため setInterval で代替)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // 1 秒ごとに currentTime を読んで watchedSec / lastPositionSec を更新
    const poll = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const pos = player.getCurrentTime();
      const dur = player.getDuration();

      // duration を更新 (初回再生で取得できるケースがある)
      if (dur > 0 && resolvedDuration === 0) {
        setResolvedDuration(dur);
      }

      // blockSeek: maxAllowed より前方にジャンプしたら戻す
      if (blockSeek) {
        const max = maxAllowedPositionRef.current + SEEK_TOLERANCE_SEC;
        if (pos > max) {
          player.seekTo(Math.max(0, maxAllowedPositionRef.current), true);
          setErrorMessage(
            "前方シークは禁止されています。視聴済み位置に戻します。",
          );
          return;
        }
      }

      // watchedSec 単調増加
      if (pos > maxAllowedPositionRef.current) {
        maxAllowedPositionRef.current = pos;
      }
      const prev = watchedSecRef.current;
      const next = Math.max(prev, pos);
      if (next !== prev) {
        watchedSecRef.current = next;
        setWatchedSec(next);
        onProgress?.(next, pos);
      }
      lastPositionSecRef.current = pos;
      dirtyRef.current = true;
    }, 1_000);

    return () => clearInterval(poll);
  }, [blockSeek, resolvedDuration, onProgress]);

  // ---------------------------------------------------------------------------
  // 表示計算
  // ---------------------------------------------------------------------------

  const duration = resolvedDuration;
  const ratio = duration > 0 ? watchedSec / duration : 0;
  const ratioPct = Math.min(100, Math.round(ratio * 100));
  const requiredPct = Math.round(requiredCompletionRate * 100);

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------

  if (apiLoadError) {
    return (
      <div className="space-y-2">
        <div className="aspect-video flex items-center justify-center rounded-md bg-muted text-sm text-muted-foreground p-6 text-center">
          YouTube 動画の読み込みに失敗しました。
          <br />
          ページを再読み込みするか、動画 URL を確認してください。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md bg-black">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={`YouTube 動画 (${videoId})`}
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
        />
      </div>

      {/* API 読み込み中インジケータ */}
      {!apiReady && (
        <p className="text-xs text-muted-foreground">プレーヤーを初期化中...</p>
      )}

      {/* 進捗バー */}
      <div className="space-y-1">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="累積視聴進捗"
          aria-valuenow={ratioPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${ratioPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            累積視聴 {ratioPct}%
            {duration > 0
              ? ` (${formatTime(watchedSec)} / ${formatTime(duration)})`
              : ""}
          </span>
          <span>
            完了基準 {requiredPct}%{completed ? " (完了済み)" : ""}
          </span>
        </div>
      </div>

      {/* エラーメッセージ */}
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
          {offlineMode ? (
            <span className="ml-2 font-semibold">
              [オフラインモード: 接続が回復したら自動再開します]
            </span>
          ) : null}
        </div>
      ) : null}

      {blockSeek ? (
        <p className="text-xs text-muted-foreground">
          このレッスンは早送り (前方シーク) が制限されています。
        </p>
      ) : null}

      {duration === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          動画の長さが未設定です。完了率は管理者による長さの設定後に機能します。
        </p>
      )}
    </div>
  );
}
