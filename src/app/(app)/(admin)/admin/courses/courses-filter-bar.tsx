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

type Props = {
  currentQ?: string;
  currentPublished?: string;
};

const ALL_VALUE = "__ALL__";

export function CoursesFilterBar({ currentQ, currentPublished }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
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
        <Label htmlFor="courses-q" className="text-sm font-medium">
          コースタイトル検索
        </Label>
        <Input
          id="courses-q"
          type="search"
          placeholder="例: マネジメント基礎"
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

      {/* 公開状態 filter */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="courses-published" className="text-sm font-medium">
          公開状態
        </Label>
        <Select
          value={currentPublished ?? ALL_VALUE}
          onValueChange={(v) =>
            navigate({ published: v === ALL_VALUE ? undefined : v })
          }
        >
          <SelectTrigger id="courses-published" className="h-9 w-36">
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>すべて</SelectItem>
            <SelectItem value="true">公開中</SelectItem>
            <SelectItem value="false">下書き</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </form>
  );
}
