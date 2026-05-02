/**
 * parseVideoSource / isValidVideoUrl のユニットテスト
 *
 * - 許可パターン: FILE (sample.mp4, uploads, Vercel Blob) + YOUTUBE (各種フォーマット)
 * - 拒否パターン: http://, javascript:, パストラバーサル, 不正 ID 長, 外部 mp4 等
 * - 戻り値の型ごとに videoId / embedUrl の値まで検証する
 */
import { describe, it, expect } from "vitest";
import { parseVideoSource, isValidVideoUrl } from "@/lib/video-source";

// ---------------------------------------------------------------------------
// 許可パターン
// ---------------------------------------------------------------------------

describe("parseVideoSource — 許可パターン", () => {
  // ---------- FILE: /sample.mp4 ----------
  it("/sample.mp4 は FILE を返す", () => {
    const result = parseVideoSource("/sample.mp4");
    expect(result).toEqual({ type: "FILE", url: "/sample.mp4" });
  });

  // ---------- FILE: /uploads/<key>.mp4 ----------
  it("/uploads/abc123.mp4 は FILE を返す", () => {
    const result = parseVideoSource("/uploads/abc123.mp4");
    expect(result).toEqual({ type: "FILE", url: "/uploads/abc123.mp4" });
  });

  it("/uploads/video-key_v2.mp4 はハイフン・アンダースコアを含んでも FILE を返す", () => {
    const result = parseVideoSource("/uploads/video-key_v2.mp4");
    expect(result).toEqual({ type: "FILE", url: "/uploads/video-key_v2.mp4" });
  });

  it("/uploads/file.with.dots.mp4 はドットを含んでも FILE を返す", () => {
    const result = parseVideoSource("/uploads/file.with.dots.mp4");
    expect(result).toEqual({ type: "FILE", url: "/uploads/file.with.dots.mp4" });
  });

  // ---------- FILE: Vercel Blob ----------
  it("Vercel Blob URL は FILE を返す", () => {
    const url =
      "https://abc123def.public.blob.vercel-storage.com/video/lesson1.mp4";
    const result = parseVideoSource(url);
    expect(result).toEqual({ type: "FILE", url });
  });

  it("Vercel Blob URL は mp4 拡張子なしでも FILE を返す", () => {
    const url =
      "https://xyz.public.blob.vercel-storage.com/some/path/without-ext";
    const result = parseVideoSource(url);
    expect(result).toEqual({ type: "FILE", url });
  });

  // ---------- YOUTUBE: watch?v= ----------
  it("https://www.youtube.com/watch?v=dQw4w9WgXcY は YOUTUBE を返す", () => {
    const result = parseVideoSource(
      "https://www.youtube.com/watch?v=dQw4w9WgXcY",
    );
    expect(result).not.toBeNull();
    expect(result?.type).toBe("YOUTUBE");
    if (result?.type === "YOUTUBE") {
      expect(result.videoId).toBe("dQw4w9WgXcY");
      expect(result.embedUrl).toBe(
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcY?rel=0&modestbranding=1&enablejsapi=1",
      );
    }
  });

  it("www なし https://youtube.com/watch?v=<id> も YOUTUBE を返す", () => {
    const result = parseVideoSource(
      "https://youtube.com/watch?v=abcdefghijk",
    );
    expect(result?.type).toBe("YOUTUBE");
    if (result?.type === "YOUTUBE") {
      expect(result.videoId).toBe("abcdefghijk");
    }
  });

  it("クエリパラメータ付き watch URL (&t=120s) でも videoId を正しく抽出する", () => {
    const result = parseVideoSource(
      "https://www.youtube.com/watch?v=dQw4w9WgXcY&t=120s&list=PL12345",
    );
    expect(result?.type).toBe("YOUTUBE");
    if (result?.type === "YOUTUBE") {
      expect(result.videoId).toBe("dQw4w9WgXcY");
    }
  });

  // ---------- YOUTUBE: youtu.be ----------
  it("https://youtu.be/<id> は YOUTUBE を返す", () => {
    const result = parseVideoSource("https://youtu.be/dQw4w9WgXcY");
    expect(result?.type).toBe("YOUTUBE");
    if (result?.type === "YOUTUBE") {
      expect(result.videoId).toBe("dQw4w9WgXcY");
    }
  });

  it("https://youtu.be/<id>?t=30 クエリ付きでも videoId を正しく抽出する", () => {
    const result = parseVideoSource("https://youtu.be/abcdefghijk?t=30");
    expect(result?.type).toBe("YOUTUBE");
    if (result?.type === "YOUTUBE") {
      expect(result.videoId).toBe("abcdefghijk");
    }
  });

  // ---------- YOUTUBE: youtube.com/embed ----------
  it("https://www.youtube.com/embed/<id> は YOUTUBE を返す", () => {
    const result = parseVideoSource(
      "https://www.youtube.com/embed/dQw4w9WgXcY",
    );
    expect(result?.type).toBe("YOUTUBE");
    if (result?.type === "YOUTUBE") {
      expect(result.videoId).toBe("dQw4w9WgXcY");
    }
  });

  // ---------- YOUTUBE: youtube-nocookie.com/embed ----------
  it("https://www.youtube-nocookie.com/embed/<id> は YOUTUBE を返す", () => {
    const result = parseVideoSource(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcY",
    );
    expect(result?.type).toBe("YOUTUBE");
    if (result?.type === "YOUTUBE") {
      expect(result.videoId).toBe("dQw4w9WgXcY");
      // embedUrl は常に youtube-nocookie に正規化される
      expect(result.embedUrl).toBe(
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcY?rel=0&modestbranding=1&enablejsapi=1",
      );
    }
  });

  // ---------- embedUrl 正規化の検証 ----------
  it("youtu.be から変換した embedUrl は youtube-nocookie.com に正規化される", () => {
    const result = parseVideoSource("https://youtu.be/dQw4w9WgXcY");
    expect(result?.type).toBe("YOUTUBE");
    if (result?.type === "YOUTUBE") {
      expect(result.embedUrl).toMatch(
        /^https:\/\/www\.youtube-nocookie\.com\/embed\//,
      );
      expect(result.embedUrl).toContain("rel=0");
      expect(result.embedUrl).toContain("modestbranding=1");
      expect(result.embedUrl).toContain("enablejsapi=1");
    }
  });
});

// ---------------------------------------------------------------------------
// 拒否パターン
// ---------------------------------------------------------------------------

describe("parseVideoSource — 拒否パターン", () => {
  it("http:// YouTube URL は null を返す (https 必須)", () => {
    expect(
      parseVideoSource("http://www.youtube.com/watch?v=dQw4w9WgXcY"),
    ).toBeNull();
  });

  it("http:// の外部 mp4 URL は null を返す", () => {
    expect(parseVideoSource("http://example.com/video.mp4")).toBeNull();
  });

  it("javascript: スキームは null を返す", () => {
    expect(parseVideoSource("javascript:alert(1)")).toBeNull();
  });

  it("パストラバーサル /uploads/../etc/passwd は null を返す", () => {
    // RE_FILE_UPLOADS は [\w.\-]+ のみ許可し '/' を含まないため弾かれる
    expect(parseVideoSource("/uploads/../etc/passwd")).toBeNull();
  });

  it("不正な YouTube ID 長 (10 文字) は null を返す", () => {
    expect(
      parseVideoSource("https://www.youtube.com/watch?v=shortId123"),
    ).toBeNull();
  });

  it("不正な YouTube ID 長 (12 文字) は null を返す", () => {
    expect(
      parseVideoSource("https://www.youtube.com/watch?v=tooLongIdXXXX"),
    ).toBeNull();
  });

  it("外部サイトの https mp4 URL は null を返す", () => {
    expect(
      parseVideoSource("https://attacker.example.com/evil.mp4"),
    ).toBeNull();
  });

  it("Vercel Blob に似た偽ドメインは null を返す", () => {
    expect(
      parseVideoSource(
        "https://evil.public.blob.vercel-storage.com.attacker.example/video.mp4",
      ),
    ).toBeNull();
  });

  it("空文字は null を返す", () => {
    expect(parseVideoSource("")).toBeNull();
  });

  it("/uploads/ のみ (key なし) は null を返す", () => {
    expect(parseVideoSource("/uploads/")).toBeNull();
  });

  it("/uploads/<key> で .mp4 拡張子なしは null を返す", () => {
    expect(parseVideoSource("/uploads/video")).toBeNull();
  });

  it("YouTube URL に v パラメータがない場合は null を返す", () => {
    expect(
      parseVideoSource("https://www.youtube.com/watch?list=PLxxx"),
    ).toBeNull();
  });

  it("youtu.be で ID が 11 文字未満の場合は null を返す", () => {
    expect(parseVideoSource("https://youtu.be/short")).toBeNull();
  });

  it("YouTube ID に許可外文字 (スペース) が含まれる場合は null を返す", () => {
    expect(
      parseVideoSource("https://www.youtube.com/watch?v=invalid id!!"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isValidVideoUrl ヘルパ
// ---------------------------------------------------------------------------

describe("isValidVideoUrl", () => {
  it("許可 URL に対して true を返す", () => {
    expect(isValidVideoUrl("/sample.mp4")).toBe(true);
    expect(isValidVideoUrl("/uploads/test.mp4")).toBe(true);
    expect(
      isValidVideoUrl(
        "https://abc.public.blob.vercel-storage.com/video.mp4",
      ),
    ).toBe(true);
    expect(
      isValidVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcY"),
    ).toBe(true);
  });

  it("拒否 URL に対して false を返す", () => {
    expect(isValidVideoUrl("javascript:alert(1)")).toBe(false);
    expect(isValidVideoUrl("http://example.com/video.mp4")).toBe(false);
    expect(isValidVideoUrl("/uploads/../etc/passwd")).toBe(false);
    expect(isValidVideoUrl("")).toBe(false);
  });
});
