/**
 * M-2: fetchYouTubeMeta の SSRF / レスポンスサイズ制限テスト
 *
 * - redirect: "manual" で 3xx をブロックすること
 * - 2MB 超過レスポンスを null で返すこと
 * - 正常ケース (HTML パース成功) でメタデータを返すこと
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchYouTubeMeta } from "@/lib/youtube-meta";

// parseVideoSource が呼ばれる前に YouTube URL を通すため mock しない
// fetch を vi.stubGlobal でモックして外部通信を回避する

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 指定バイト長のダミー ReadableStream を生成するヘルパー */
function makeStream(totalBytes: number): ReadableStream<Uint8Array> {
  const CHUNK_SIZE = 65_536;
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const remaining = totalBytes - sent;
      const chunkSize = Math.min(CHUNK_SIZE, remaining);
      controller.enqueue(new Uint8Array(chunkSize));
      sent += chunkSize;
    },
  });
}

/** 正常な YouTube HTML のスタブ (ytInitialPlayerResponse を含む) */
const VALID_HTML = `
<html><head></head><body>
<script>
var ytInitialPlayerResponse = {"videoDetails":{"videoId":"dQw4w9WgXcY","title":"Rick Astley","lengthSeconds":"213"}};
</script>
</body></html>
`;

describe("fetchYouTubeMeta — SSRF / サイズ制限", () => {
  it("3xx (opaqueredirect) レスポンスが返ってきたとき null を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false, // redirect: "manual" のとき ok は false になる
        type: "opaqueredirect",
        status: 302,
        body: null,
      }),
    );

    const result = await fetchYouTubeMeta(
      "https://www.youtube.com/watch?v=dQw4w9WgXcY",
    );
    expect(result).toBeNull();
  });

  it("ok: false で type が opaqueredirect でないときも null を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        type: "default",
        status: 404,
        body: null,
      }),
    );

    const result = await fetchYouTubeMeta(
      "https://www.youtube.com/watch?v=dQw4w9WgXcY",
    );
    expect(result).toBeNull();
  });

  it("2MB を超えるレスポンスは null を返す (サイズ制限)", async () => {
    const OVER_2MB = 2 * 1024 * 1024 + 1;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        type: "default",
        status: 200,
        body: makeStream(OVER_2MB),
      }),
    );

    const result = await fetchYouTubeMeta(
      "https://www.youtube.com/watch?v=dQw4w9WgXcY",
    );
    expect(result).toBeNull();
  });

  it("2MB ちょうどのレスポンスは null を返す (不正な HTML でパース失敗)", async () => {
    // 2MB のバイナリ → HTML パース失敗 → null
    const EXACTLY_2MB = 2 * 1024 * 1024;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        type: "default",
        status: 200,
        body: makeStream(EXACTLY_2MB),
      }),
    );

    const result = await fetchYouTubeMeta(
      "https://www.youtube.com/watch?v=dQw4w9WgXcY",
    );
    // 2MB 以内なので fetch 自体は通過するが ytInitialPlayerResponse がないので null
    expect(result).toBeNull();
  });

  it("正常な YouTube HTML からメタデータを返す", async () => {
    const html = VALID_HTML;
    const bytes = new TextEncoder().encode(html);
    let sent = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        type: "default",
        status: 200,
        body: new ReadableStream({
          pull(controller) {
            if (!sent) {
              controller.enqueue(bytes);
              sent = true;
            } else {
              controller.close();
            }
          },
        }),
      }),
    );

    const result = await fetchYouTubeMeta(
      "https://www.youtube.com/watch?v=dQw4w9WgXcY",
    );
    expect(result).not.toBeNull();
    expect(result?.videoId).toBe("dQw4w9WgXcY");
    expect(result?.durationSec).toBe(213);
    expect(result?.title).toBe("Rick Astley");
  });

  it("fetch 自体がスローした場合は null を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );

    const result = await fetchYouTubeMeta(
      "https://www.youtube.com/watch?v=dQw4w9WgXcY",
    );
    expect(result).toBeNull();
  });

  it("不正な URL を渡すと null を返す (YouTube URL ではない)", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchYouTubeMeta("https://example.com/video");
    // parseVideoSource が YOUTUBE 以外を返すため fetch を呼ばずに null
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
