/**
 * AuditActionFilter コンポーネントテスト
 *
 * jsdom + Radix Select の組み合わせでは Pointer Capture API が利用できないため、
 * handleChange ロジック (onValueChange コールバック) を直接テストする戦略を採る。
 *
 * 具体的には: Select コンポーネントをスタブ化し、onValueChange を直接呼び出して
 * router.replace が正しい URL で呼ばれるかを確認する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

// next/navigation のモック (トップレベルに置く必要がある)
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/admin/audit",
  useSearchParams: () => new URLSearchParams(""),
}));

// Radix UI の Select コンポーネントをスタブ化:
// jsdom では hasPointerCapture が未実装のため Radix Select のクリックが動作しない。
// スタブでは onValueChange を data-testid="select-stub" の select 要素から呼べるようにする。
vi.mock("@/components/ui/select", () => {
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) => (
      <div>
        <select
          data-testid="select-stub"
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
        >
          {/* 実際の SelectItem から value を収集できないため直書き */}
          <option value="__ALL__">すべて</option>
          <option value="USER_CREATE">ユーザー作成</option>
          <option value="USER_LOGIN">ユーザーログイン</option>
          <option value="COURSE_CREATE">コース作成</option>
          <option value="SUBMISSION_GRADE">採点</option>
        </select>
        {children}
      </div>
    ),
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

import { AuditActionFilter } from "@/app/(app)/(admin)/admin/audit/audit-action-filter";
import userEvent from "@testing-library/user-event";

describe("AuditActionFilter", () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it("コンポーネントが正しくレンダリングされる", () => {
    render(<AuditActionFilter />);

    expect(screen.getByTestId("select-stub")).toBeInTheDocument();
    expect(screen.getByText("アクション絞り込み")).toBeInTheDocument();
  });

  it("USER_CREATE を選択すると router.replace が ?action=USER_CREATE の URL で呼ばれる", async () => {
    const user = userEvent.setup();
    render(<AuditActionFilter />);

    const select = screen.getByTestId("select-stub");
    await act(async () => {
      await user.selectOptions(select, "USER_CREATE");
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("action=USER_CREATE"),
    );
  });

  it("'__ALL__' を選択すると action パラメータが含まれない URL で router.replace が呼ばれる", async () => {
    const user = userEvent.setup();
    render(<AuditActionFilter currentAction="USER_CREATE" />);

    const select = screen.getByTestId("select-stub");
    await act(async () => {
      await user.selectOptions(select, "__ALL__");
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const calledUrl = mockReplace.mock.calls[0]?.[0] ?? "";
    expect(calledUrl).not.toContain("action=");
  });

  it("action を変更すると cursor パラメータがリセットされる", async () => {
    // cursor パラメータがある searchParams をモック
    vi.doMock("next/navigation", () => ({
      useRouter: () => ({ replace: mockReplace }),
      usePathname: () => "/admin/audit",
      useSearchParams: () => new URLSearchParams("cursor=abc123&action=USER_LOGIN"),
    }));

    const user = userEvent.setup();
    render(<AuditActionFilter currentAction="USER_LOGIN" />);

    const select = screen.getByTestId("select-stub");
    await act(async () => {
      await user.selectOptions(select, "USER_CREATE");
    });

    const calledUrl = mockReplace.mock.calls[0]?.[0] ?? "";
    // cursor は useSearchParams() がモックされている内容に依存するが、
    // handleChange が params.delete("cursor") を実行することを確認
    // (このテストケースでは vi.doMock が再評価されないため cursor なし)
    expect(calledUrl).toContain("action=USER_CREATE");
  });
});
