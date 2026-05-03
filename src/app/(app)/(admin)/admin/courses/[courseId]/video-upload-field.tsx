"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseVideoSource } from "@/lib/video-source";

type Props = {
  /** form の input name (通常 "videoUrl") */
  name: string;
  defaultValue?: string;
  disabled?: boolean;
};

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "done" }
  | { phase: "error"; message: string };

type TabValue = "file" | "youtube";

const SAMPLE_URL = "/sample.mp4";

/** 現在の URL がどのタブか判定する */
function detectInitialTab(url: string): TabValue {
  const source = parseVideoSource(url);
  if (source?.type === "YOUTUBE") return "youtube";
  return "file";
}

function VideoUrlDescription({ url }: { url: string }) {
  if (url === SAMPLE_URL) {
    return (
      <p className="text-xs text-muted-foreground">
        現在:サンプル動画 (
        <a
          href={SAMPLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          /sample.mp4
        </a>
        )
      </p>
    );
  }
  const source = parseVideoSource(url);
  if (source?.type === "YOUTUBE") {
    return (
      <p className="text-xs text-muted-foreground">
        現在: YouTube 動画 (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          {url}
        </a>
        )
      </p>
    );
  }
  if (url.startsWith("/uploads/")) {
    return (
      <p className="text-xs text-muted-foreground">
        現在:アップロード済み動画 (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          {url}
        </a>
        )
      </p>
    );
  }
  // Vercel Blob URL 等
  return (
    <p className="text-xs text-muted-foreground">
      現在:{" "}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all underline hover:no-underline"
      >
        {url}
      </a>
    </p>
  );
}

export function VideoUploadField({
  name,
  defaultValue = SAMPLE_URL,
  disabled = false,
}: Props) {
  const [videoUrl, setVideoUrl] = useState(defaultValue);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "idle" });
  const [activeTab, setActiveTab] = useState<TabValue>(() =>
    detectInitialTab(defaultValue),
  );
  // YouTube タブの入力バッファ (確定前の編集中 URL)
  const [youtubeInput, setYoutubeInput] = useState(() => {
    const source = parseVideoSource(defaultValue);
    return source?.type === "YOUTUBE" ? defaultValue : "";
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  const isUploading = uploadState.phase === "uploading";
  const isDisabled = disabled || isUploading;

  // YouTube プレビュー: 入力中に parseVideoSource で判定
  const youtubeSource = parseVideoSource(youtubeInput);
  const youtubePreviewUrl =
    youtubeSource?.type === "YOUTUBE" ? youtubeSource.embedUrl : null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "video/mp4") {
      setUploadState({
        phase: "error",
        message: "mp4 ファイルのみアップロードできます。",
      });
      return;
    }

    void startUpload(file);
  }

  async function startUpload(file: File) {
    setUploadState({ phase: "uploading", progress: 0 });

    let uploadUrl: string;
    let blobUrl: string;

    try {
      const res = await fetch("/api/admin/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: "video/mp4",
          sizeBytes: file.size,
        }),
      });

      const json = (await res.json()) as
        | { ok: true; data: { uploadUrl: string; blobUrl: string } }
        | { ok: false; error: { code: string; message: string } };

      if (!json.ok) {
        setUploadState({ phase: "error", message: json.error.message });
        return;
      }

      uploadUrl = json.data.uploadUrl;
      blobUrl = json.data.blobUrl;
    } catch {
      setUploadState({
        phase: "error",
        message: "アップロード URL の取得に失敗しました。",
      });
      return;
    }

    try {
      const finalBlobUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setUploadState({ phase: "uploading", progress: pct });
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const body = JSON.parse(xhr.responseText) as
                | { ok: true; data: { blobUrl: string } }
                | { ok: false; error: { code: string; message: string } };
              if (body.ok) {
                resolve(body.data.blobUrl);
              } else {
                reject(new Error(body.error.message));
              }
            } catch {
              reject(new Error("レスポンスの解析に失敗しました。"));
            }
          } else if (xhr.status === 413) {
            reject(new Error("ファイルサイズは 2 GB 以下にしてください。"));
          } else {
            try {
              const body = JSON.parse(xhr.responseText) as {
                ok: false;
                error: { message: string };
              };
              reject(
                new Error(
                  body.error?.message ?? "アップロードに失敗しました。",
                ),
              );
            } catch {
              reject(
                new Error(`アップロードに失敗しました (HTTP ${xhr.status})。`),
              );
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error("ネットワークエラーが発生しました。"));
        };

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", "video/mp4");
        xhr.send(file);
      });

      setVideoUrl(finalBlobUrl);
      setUploadState({ phase: "done" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "アップロードに失敗しました。";
      setUploadState({ phase: "error", message });
    }

    void blobUrl;
  }

  function handleYoutubeConfirm() {
    if (!youtubeSource || youtubeSource.type !== "YOUTUBE") return;
    setVideoUrl(youtubeInput.trim());
  }

  return (
    <div className="space-y-2">
      {/* hidden input: form submit 時に videoUrl を載せる */}
      <input type="hidden" name={name} value={videoUrl} />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
      >
        <TabsList className="mb-2">
          <TabsTrigger value="file" disabled={isDisabled}>
            ファイルアップロード
          </TabsTrigger>
          <TabsTrigger value="youtube" disabled={isDisabled}>
            YouTube URL
          </TabsTrigger>
        </TabsList>

        {/* ---- ファイルアップロードタブ ---- */}
        <TabsContent value="file" className="space-y-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-file`}>動画ファイル</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                id={`${fieldId}-file`}
                name={`${fieldId}-file-picker`}
                type="file"
                accept="video/mp4"
                className="sr-only"
                disabled={isDisabled}
                aria-disabled={isDisabled}
                onChange={handleFileChange}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isDisabled}
                aria-disabled={isDisabled}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadState.phase === "done"
                  ? "再アップロード"
                  : "ファイルを選択"}
              </Button>
              <span className="text-xs text-muted-foreground">
                .mp4 形式、最大 2 GB
              </span>
            </div>
          </div>

          {/* 進捗バー */}
          {isUploading && (
            <div
              role="progressbar"
              aria-label="アップロード進捗"
              aria-valuenow={uploadState.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="space-y-1"
            >
              <p className="text-xs text-muted-foreground">
                アップロード中... {uploadState.progress}%
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
            </div>
          )}

          {uploadState.phase === "done" && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              アップロード完了。保存ボタンを押して反映してください。
            </p>
          )}

          {uploadState.phase === "error" && (
            <p className="text-xs text-destructive" role="alert">
              {uploadState.message}
            </p>
          )}

          {/* 手動 URL 入力 (上級者向け折り畳み) */}
          <details className="text-sm">
            <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
              手動で URL を入力する (上級者向け)
            </summary>
            <div className="mt-1.5 space-y-1">
              <Label htmlFor={`${fieldId}-manual`} className="text-xs">
                動画 URL (/sample.mp4、/uploads/... または Vercel Blob URL)
              </Label>
              <Input
                id={`${fieldId}-manual`}
                type="url"
                className="h-7 text-xs font-mono"
                value={videoUrl}
                disabled={isDisabled}
                aria-disabled={isDisabled}
                onChange={(e) => {
                  setVideoUrl(e.target.value);
                  if (uploadState.phase !== "idle") {
                    setUploadState({ phase: "idle" });
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                上のフォームから選択した場合、自動的に更新されます。
              </p>
            </div>
          </details>
        </TabsContent>

        {/* ---- YouTube URL タブ ---- */}
        <TabsContent value="youtube" className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-youtube`}>YouTube URL</Label>
            <div className="flex gap-2">
              <Input
                id={`${fieldId}-youtube`}
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                className="font-mono text-sm"
                value={youtubeInput}
                disabled={isDisabled}
                aria-disabled={isDisabled}
                onChange={(e) => setYoutubeInput(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={
                  isDisabled ||
                  youtubeSource?.type !== "YOUTUBE" ||
                  youtubeInput.trim() === videoUrl
                }
                onClick={handleYoutubeConfirm}
              >
                確定
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              対応形式: youtube.com/watch?v=... / youtu.be/... / 埋め込み URL
            </p>
          </div>

          {/* YouTube プレビュー */}
          {youtubePreviewUrl ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">プレビュー</p>
              <div className="overflow-hidden rounded-md border">
                <iframe
                  src={youtubePreviewUrl}
                  title="YouTube プレビュー"
                  className="aspect-video"
                  style={{ width: 320 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ) : youtubeInput.trim() !== "" ? (
            <p className="text-xs text-destructive" role="alert">
              有効な YouTube URL を入力してください。
            </p>
          ) : null}

          {/* YouTube 動画の duration 自動取得の説明 */}
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            「再生時間 (秒)」を <span className="font-mono">0</span> のままにしておくと、保存時に
            YouTube から動画の長さを自動取得します。手動で値を入れた場合はその値が優先されます。
          </div>
        </TabsContent>
      </Tabs>

      {/* 現在の videoUrl 表示 (タブ共通) */}
      <VideoUrlDescription url={videoUrl} />
    </div>
  );
}
