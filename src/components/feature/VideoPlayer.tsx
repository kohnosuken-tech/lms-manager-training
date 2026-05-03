"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parseVideoSource } from "@/lib/video-source";
import { YouTubePlayer } from "./YouTubePlayer";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const SAVE_INTERVAL_MS = 10_000;
const SEEK_TOLERANCE_SEC = 5;
/** 連続失敗がこの回数に達したら「オフラインモード」警告を表示 */
const OFFLINE_THRESHOLD = 3;

export type VideoPlayerProps = {
  lessonId: string;
  videoUrl: string;
  durationSec: number;
  blockSeek: boolean;
  requiredCompletionRate?: number | null;
  initialWatchedSec?: number;
  initialLastPositionSec?: number;
  initialCompleted?: boolean;
  // 後方互換: mock シミュレートモード
  simulateEnabled?: boolean;
};

type SaveResponse =
  | { ok: true; data: { completed: boolean } }
  | { ok: false; error: { code: string; message: string } };

function formatTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// FILE 動画専用コンポーネント (既存ロジックをそのまま維持)
// ---------------------------------------------------------------------------

type FileVideoPlayerProps = {
  lessonId: string;
  src: string;
  durationSec: number;
  blockSeek: boolean;
  initialPositionSec: number;
  initialWatchedSec: number;
  requiredCompletionRate: number;
  initiallyCompleted: boolean;
  simulateEnabled: boolean;
};

function FileVideoPlayer({
  lessonId,
  src: srcProp,
  durationSec,
  blockSeek,
  initialPositionSec,
  initialWatchedSec,
  requiredCompletionRate,
  initiallyCompleted,
  simulateEnabled,
}: FileVideoPlayerProps) {
  // /uploads/ 始まりの場合は署名付き API ルート経由で再生する
  const src = srcProp.startsWith("/uploads/")
    ? `/api/lessons/${lessonId}/video`
    : srcProp;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState<number>(initialPositionSec);
  const [watchedSec, setWatchedSec] = useState<number>(initialWatchedSec);
  const [completed, setCompleted] = useState<boolean>(initiallyCompleted);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoUnplayable, setVideoUnplayable] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [offlineMode, setOfflineMode] = useState<boolean>(false);

  // 最大既読位置 (シーク制御用)
  const maxAllowedPositionRef = useRef<number>(initialPositionSec);
  // 直近送信した watchedSec / lastPositionSec
  const lastSentRef = useRef<{ w: number; p: number }>({
    w: initialWatchedSec,
    p: initialPositionSec,
  });
  // dirty フラグ (最新値が未送信なら true)
  const dirtyRef = useRef<boolean>(false);
  // 連続ネットワーク失敗カウンタ
  const consecutiveFailRef = useRef<number>(0);
  // 完了済みフラグ (toast 二重発火防止)
  const completedRef = useRef<boolean>(initiallyCompleted);

  // 保存ヘルパ
  const saveProgress = useCallback(
    async (
      w: number,
      p: number,
      opts?: { keepalive?: boolean },
    ): Promise<void> => {
      // 同値なら送らない
      if (w === lastSentRef.current.w && p === lastSentRef.current.p) {
        return;
      }
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
            // 強制巻き戻し
            const v = videoRef.current;
            if (v) {
              const target = Math.min(
                maxAllowedPositionRef.current,
                v.duration || 0,
              );
              v.currentTime = Math.max(0, target);
              setCurrentTime(target);
            }
          } else {
            setErrorMessage(json.error.message);
          }
          return;
        }
        lastSentRef.current = { w, p };
        dirtyRef.current = false;
        consecutiveFailRef.current = 0;
        setOfflineMode(false);
        if (json.data.completed && !completedRef.current) {
          completedRef.current = true;
          setCompleted(true);
          toast.success("このレッスンを完了しました 🎉");
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
    [lessonId],
  );

  // 10 秒間隔で保存 (再生中のみ)
  useEffect(() => {
    if (!playing && !simulating) return;
    const interval = window.setInterval(() => {
      if (dirtyRef.current) {
        const w = watchedSec;
        const p = currentTime;
        void saveProgress(w, p);
      }
    }, SAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [playing, simulating, watchedSec, currentTime, saveProgress]);

  // アンマウント時に最後の進捗を送る
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        const w = watchedSec;
        const p = currentTime;
        void saveProgress(w, p, { keepalive: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // playbackRate 反映
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
  }, [rate]);

  // === HTMLVideoElement イベントハンドラ ===
  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    // watchedSec は単調増加: 前回より進んだ分だけ加算
    setWatchedSec((prev) => {
      const delta = Math.max(0, t - lastSentRef.current.p);
      // 大きすぎるジャンプ (シーク) は無視
      const clamped = delta > 2 ? 0 : delta;
      return Math.max(prev, prev + clamped);
    });
    setCurrentTime(t);
    // 最大既読位置を更新
    if (t > maxAllowedPositionRef.current) {
      maxAllowedPositionRef.current = t;
    }
    dirtyRef.current = true;
  };

  const handlePlay = () => {
    setPlaying(true);
    setErrorMessage(null);
  };
  const handlePause = () => {
    setPlaying(false);
  };
  const handleEnded = async () => {
    setPlaying(false);
    const v = videoRef.current;
    const finalPos = v?.currentTime ?? currentTime;
    const finalWatched = Math.max(watchedSec, finalPos);
    setWatchedSec(finalWatched);
    setCurrentTime(finalPos);
    dirtyRef.current = true;
    await saveProgress(finalWatched, finalPos);
  };
  const handleError = () => {
    setVideoUnplayable(true);
  };

  const handleSeeking = () => {
    if (!blockSeek) return;
    const v = videoRef.current;
    if (!v) return;
    const max = maxAllowedPositionRef.current + SEEK_TOLERANCE_SEC;
    if (v.currentTime > max) {
      v.currentTime = Math.max(0, maxAllowedPositionRef.current);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {
        setVideoUnplayable(true);
      });
    } else {
      v.pause();
    }
  };

  // === シミュレートモード ===
  useEffect(() => {
    if (!simulating) return;
    const interval = window.setInterval(() => {
      setWatchedSec((prev) => {
        const next = Math.min(prev + 30, durationSec);
        return next;
      });
      setCurrentTime((prev) => Math.min(prev + 30, durationSec));
      maxAllowedPositionRef.current = Math.min(
        maxAllowedPositionRef.current + 30,
        durationSec,
      );
      dirtyRef.current = true;
    }, 1000);
    return () => window.clearInterval(interval);
  }, [simulating, durationSec]);

  useEffect(() => {
    if (simulating && watchedSec >= durationSec && durationSec > 0) {
      setSimulating(false);
      dirtyRef.current = true;
      void saveProgress(watchedSec, currentTime);
    }
  }, [simulating, watchedSec, durationSec, currentTime, saveProgress]);

  const handleManualSave = async () => {
    await saveProgress(watchedSec, currentTime);
  };

  const ratio = durationSec > 0 ? watchedSec / durationSec : 0;
  const ratioPct = Math.min(100, Math.round(ratio * 100));
  const requiredPct = Math.round(requiredCompletionRate * 100);

  // blockSeek 時にコンテナのキーボード操作 (Space / Enter) で再生/停止をトグルする
  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!blockSeek) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      togglePlay();
    }
  };

  return (
    <div className="space-y-4">
      <div
        className="overflow-hidden rounded-md bg-muted"
        tabIndex={blockSeek ? 0 : undefined}
        role={blockSeek ? "button" : undefined}
        aria-label={blockSeek ? "動画プレーヤー — スペースで再生/停止" : undefined}
        onKeyDown={blockSeek ? handleContainerKeyDown : undefined}
      >
        {videoUnplayable ? (
          <div className="aspect-video flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
            動画を再生できませんでした (モック環境のダミー mp4)。
            <br />
            シミュレートモードで進捗 UI をテストしてください。
          </div>
        ) : (
          <video
            ref={videoRef}
            src={src}
            className="aspect-video w-full bg-black"
            controls={!blockSeek}
            preload="metadata"
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            onError={handleError}
            onSeeking={handleSeeking}
          />
        )}
      </div>

      {/* 自前コントロール (blockSeek 時 or video エラー時のフォールバック) */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={togglePlay}
          disabled={videoUnplayable}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              togglePlay();
            }
          }}
          aria-label={playing ? "停止" : "再生"}
        >
          {playing ? "停止" : "再生"}
        </Button>

        <label className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">速度</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            disabled={videoUnplayable}
          >
            {PLAYBACK_RATES.map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
        </label>

        <span className="text-muted-foreground tabular-nums text-xs">
          {formatTime(currentTime)} / {formatTime(durationSec)}
        </span>

        {simulateEnabled ? (
          <Button
            type="button"
            size="sm"
            variant={simulating ? "default" : "secondary"}
            onClick={() => setSimulating((s) => !s)}
          >
            {simulating ? "シミュレート停止" : "シミュレート再生 (mock)"}
          </Button>
        ) : null}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleManualSave}
        >
          進捗を手動保存
        </Button>
      </div>

      {/* 進捗バー (累積視聴) */}
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
          <span>累積視聴 {ratioPct}%</span>
          <span>
            完了基準 {requiredPct}%{completed ? " (完了済み)" : ""}
          </span>
        </div>
      </div>

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// 公開コンポーネント: videoUrl を受け取り FILE / YOUTUBE を振り分ける
// ---------------------------------------------------------------------------

export function VideoPlayer({
  lessonId,
  videoUrl,
  durationSec,
  blockSeek,
  requiredCompletionRate,
  initialWatchedSec = 0,
  initialLastPositionSec = 0,
  initialCompleted = false,
  simulateEnabled = false,
}: VideoPlayerProps) {
  const source = parseVideoSource(videoUrl);
  const resolvedRate = requiredCompletionRate ?? 0.95;

  if (source === null) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        動画 URL が不正です。管理者に連絡してください。
        <span className="ml-2 font-mono text-xs opacity-70">{videoUrl}</span>
      </div>
    );
  }

  if (source.type === "YOUTUBE") {
    return (
      <YouTubePlayer
        lessonId={lessonId}
        videoId={source.videoId}
        embedUrl={source.embedUrl}
        durationSec={durationSec}
        blockSeek={blockSeek}
        requiredCompletionRate={resolvedRate}
        initialWatchedSec={initialWatchedSec}
        initialLastPositionSec={initialLastPositionSec}
        initialCompleted={initialCompleted}
        onCompleted={() => toast.success("このレッスンを完了しました 🎉")}
      />
    );
  }

  // source.type === "FILE"
  return (
    <FileVideoPlayer
      lessonId={lessonId}
      src={source.url}
      durationSec={durationSec}
      blockSeek={blockSeek}
      initialPositionSec={initialLastPositionSec}
      initialWatchedSec={initialWatchedSec}
      requiredCompletionRate={resolvedRate}
      initiallyCompleted={initialCompleted}
      simulateEnabled={simulateEnabled}
    />
  );
}
