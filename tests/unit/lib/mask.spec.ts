/**
 * L-4: maskEmail ユーティリティのテスト
 */
import { describe, it, expect } from "vitest";
import { maskEmail } from "@/lib/mask";

describe("maskEmail", () => {
  it("通常のメールアドレスをマスクする", () => {
    expect(maskEmail("alice@example.com")).toBe("a****@example.com");
  });

  it("別のドメインでも正しくマスクする", () => {
    expect(maskEmail("bob@example.co.jp")).toBe("b****@example.co.jp");
  });

  it("local part が 1 文字のメールアドレスをマスクする", () => {
    expect(maskEmail("x@y.com")).toBe("x****@y.com");
  });

  it("local part が長いメールアドレスは先頭 1 文字のみ残す", () => {
    expect(maskEmail("longemail@domain.org")).toBe("l****@domain.org");
  });

  it("@ がない場合は全体を `****` にする", () => {
    expect(maskEmail("invalid")).toBe("****");
  });

  it("@ で始まるメールアドレスは local part が空なので `****@domain` になる", () => {
    expect(maskEmail("@example.com")).toBe("****@example.com");
  });

  it("複数の @ を含む場合は最初の @ を区切りにする", () => {
    // 最初の @ で分割: local = "a", domain = "@b@c.com"
    expect(maskEmail("a@b@c.com")).toBe("a****@b@c.com");
  });
});
