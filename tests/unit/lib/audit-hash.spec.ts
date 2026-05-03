/**
 * audit-hash ユーティリティの単体テスト
 */
import { describe, it, expect } from "vitest";
import { computeAuditHash, type AuditHashInput } from "@/lib/audit-hash";

const baseInput: AuditHashInput = {
  id: "test-id-001",
  actorId: "actor-001",
  action: "USER_LOGIN",
  target: "User:actor-001",
  diff: '{"key":"value"}',
  createdAt: new Date("2026-05-02T10:00:00.000Z"),
  prevHash: null,
};

describe("computeAuditHash", () => {
  it("同じ入力は常に同じ hash を返す", () => {
    const hash1 = computeAuditHash(baseInput);
    const hash2 = computeAuditHash(baseInput);
    expect(hash1).toBe(hash2);
  });

  it("64 文字の hex 文字列を返す (SHA-256)", () => {
    const hash = computeAuditHash(baseInput);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prevHash が違うと hash が変わる", () => {
    const withNull = computeAuditHash({ ...baseInput, prevHash: null });
    const withHash = computeAuditHash({
      ...baseInput,
      prevHash: "a".repeat(64),
    });
    expect(withNull).not.toBe(withHash);
  });

  it("id が違うと hash が変わる", () => {
    const hash1 = computeAuditHash({ ...baseInput, id: "id-aaa" });
    const hash2 = computeAuditHash({ ...baseInput, id: "id-bbb" });
    expect(hash1).not.toBe(hash2);
  });

  it("actorId が違うと hash が変わる", () => {
    const hash1 = computeAuditHash({ ...baseInput, actorId: "actor-A" });
    const hash2 = computeAuditHash({ ...baseInput, actorId: "actor-B" });
    expect(hash1).not.toBe(hash2);
  });

  it("action が違うと hash が変わる", () => {
    const hash1 = computeAuditHash({ ...baseInput, action: "USER_LOGIN" });
    const hash2 = computeAuditHash({ ...baseInput, action: "USER_CREATE" });
    expect(hash1).not.toBe(hash2);
  });

  it("target が違うと hash が変わる", () => {
    const hash1 = computeAuditHash({ ...baseInput, target: "User:001" });
    const hash2 = computeAuditHash({ ...baseInput, target: "Course:001" });
    expect(hash1).not.toBe(hash2);
  });

  it("diff が違うと hash が変わる", () => {
    const hash1 = computeAuditHash({ ...baseInput, diff: '{"a":1}' });
    const hash2 = computeAuditHash({ ...baseInput, diff: '{"a":2}' });
    expect(hash1).not.toBe(hash2);
  });

  it("createdAt が違うと hash が変わる", () => {
    const hash1 = computeAuditHash({
      ...baseInput,
      createdAt: new Date("2026-05-02T10:00:00.000Z"),
    });
    const hash2 = computeAuditHash({
      ...baseInput,
      createdAt: new Date("2026-05-02T11:00:00.000Z"),
    });
    expect(hash1).not.toBe(hash2);
  });

  it("null フィールドは '' に正規化される (actorId)", () => {
    // actorId=null と actorId="" は同じ hash になるべき
    const withNull = computeAuditHash({ ...baseInput, actorId: null });
    const withEmpty = computeAuditHash({ ...baseInput, actorId: "" });
    expect(withNull).toBe(withEmpty);
  });

  it("null フィールドは '' に正規化される (target)", () => {
    const withNull = computeAuditHash({ ...baseInput, target: null });
    const withEmpty = computeAuditHash({ ...baseInput, target: "" });
    expect(withNull).toBe(withEmpty);
  });

  it("null フィールドは '' に正規化される (diff)", () => {
    const withNull = computeAuditHash({ ...baseInput, diff: null });
    const withEmpty = computeAuditHash({ ...baseInput, diff: "" });
    expect(withNull).toBe(withEmpty);
  });

  it("null フィールドは '' に正規化される (prevHash)", () => {
    const withNull = computeAuditHash({ ...baseInput, prevHash: null });
    const withEmpty = computeAuditHash({ ...baseInput, prevHash: "" });
    expect(withNull).toBe(withEmpty);
  });
});
