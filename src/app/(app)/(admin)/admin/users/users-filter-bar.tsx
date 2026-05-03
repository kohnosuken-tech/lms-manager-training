"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  currentQ?: string;
  currentRole?: string;
  currentDeactivated?: string;
};

const ALL_VALUE = "__ALL__";

export function UsersFilterBar({ currentQ, currentRole, currentDeactivated }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      // filter が変わったら cursor をリセット
      params.delete("cursor");
      for (const [k, v] of Object.entries(overrides)) {
        if (v === undefined || v === "") {
          params.delete(k);
        } else {
          params.set(k, v);
        }
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <form
      role="search"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => e.preventDefault()}
    >
      {/* 検索ワード */}
      <div className="flex flex-col gap-1 min-w-48 flex-1">
        <Label htmlFor="users-q" className="text-sm font-medium">
          名前 / メール検索
        </Label>
        <Input
          id="users-q"
          type="search"
          placeholder="例: 山田 / yamada@"
          defaultValue={currentQ}
          className="h-9"
          onBlur={(e) => navigate({ q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              navigate({ q: (e.target as HTMLInputElement).value });
            }
          }}
        />
      </div>

      {/* ロール filter */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="users-role" className="text-sm font-medium">
          ロール
        </Label>
        <Select
          value={currentRole ?? ALL_VALUE}
          onValueChange={(v) => navigate({ role: v === ALL_VALUE ? undefined : v })}
        >
          <SelectTrigger id="users-role" className="h-9 w-36">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>すべて</SelectItem>
            <SelectItem value="STUDENT">受講者</SelectItem>
            <SelectItem value="ADMIN">管理者</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 無効化 filter */}
      <div className="flex items-center gap-2 pb-1">
        <Checkbox
          id="users-deactivated"
          checked={currentDeactivated === "true"}
          onCheckedChange={(checked) =>
            navigate({ deactivated: checked ? "true" : undefined })
          }
          aria-label="無効化されたユーザーのみ表示"
        />
        <Label htmlFor="users-deactivated" className="cursor-pointer text-sm">
          無効化済みのみ
        </Label>
      </div>
    </form>
  );
}
