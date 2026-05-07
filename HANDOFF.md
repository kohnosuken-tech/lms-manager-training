# 引継ぎドキュメント

> 最終更新: 2026-05-07
> このドキュメントは **次の担当者向け** に、現在の状態 / 完了済み作業 / 次にやるべきこと / 注意点 をまとめたものです。

---

## 30 秒サマリ

社内マネージャー研修 LMS を Mock-first で構築。Sprint #1〜#5 で **セキュリティ + UX 整備の punch list 30 件を全消化**、Sprint #6 で **教材データを Spreadsheet 化** (案 C 完了)、Sprint #7 で **Notion 全 DB 化に方針転換中** (架構設計 + adapter 実装まで完了、ユーザー作業待ち)。

- **コード品質**: ✅ tsc クリーン / 244 tests pass / 9 PR マージ済
- **ローカル動作**: ✅ `pnpm dev` で完全に動く (mock + Spreadsheet)
- **本番デプロイ**: ⚠️ Vercel 上で 401 のまま (Notion 移行完了 → デプロイ調整 が次のフェーズ)

---

## ✅ 完了している作業

### Sprint #1〜#5 (PR #1, #2 マージ済)

| Sprint | 内容 |
| --- | --- |
| #1+#2 | Critical 4 件 (動画 public 露出 / Upload CSRF / CSV インジェクション / VideoPlayer エラー黙殺) + UX 基盤 (sonner Toaster / AlertDialog / shadcn Select-Checkbox-RadioGroup / RequiredLabel / EmptyState / Skeleton / loading.tsx) + デザイン刷新 (ミントグリーン化) + YouTube duration 自動取得 |
| #3 | SEC High 5 (brute force / sessionVersion / cron secret / 監査 PII / IDOR) + UX High 5 (検索フィルタ / テスト誘導 CTA / 分入力 / モバイル / a11y) |
| #4 | SEC Medium 5 (CSP nonce / SSRF / Admin progress / testId 整合 / AppError 統一) + Low 4 (matcher / sign-in 隠し / fail-fast / cron mask) + UX Medium 4 (完了 toast / 設問並び替え / 上限案内 / iframe sandbox) |
| #5 | LessonRow Sheet 化 + AuditLog hash chain (改ざん検知) |

### Sprint #6 (PR #1 マージ済)
**Spreadsheet/GAS 統合** — ADR 0003-0005 に基づく案 C:
- 教材データ (Course/Lesson/Test/Question/Choice) を **Google Spreadsheet** に
- ユーザー / 進捗 / 監査ログは Prisma + SQLite を継続
- メール送信は **GAS Web App relay** (HMAC + idempotency)
- 環境変数 `CMS_SOURCE=local|spreadsheet` / `MAIL_DRIVER=stub|gas` で切替

### Sprint #7 (進行中)
**Notion 全 DB 化** — ADR 0006 で方針転換、Spreadsheet/Prisma 構成を **Notion 一本化**:
- ✅ Phase F: architect 設計完了 (`docs/adr/0006-*.md` / `docs/architecture.md` §11 / `docs/notion-setup.md`)
- ⏸ Phase G1: ユーザー作業 (個人 Notion で integration 作成 + 親ページ connect) — **未完了**
- ✅ Phase G2: backend 実装完了 (`scripts/setup-notion.ts` + 11 entity adapter + token bucket + write queue + cache)
- ⏳ Phase G3: qa (テスト追加)
- ⏳ Phase G4: devops (Vercel デプロイ整備)
- ⏳ Phase G5: 会社 Notion に env 切替 (5 分作業)

---

## 🔜 次にやること (優先順)

### 1. Phase G1 を完了させる (ユーザー作業 / 5-10 分)

`docs/notion-setup.md` の Step 1〜2:
- 個人 Notion で Internal Integration 作成 (機能: 読取/更新/挿入)
- LMS-DB ページ (https://www.notion.so/LMS-DB-356b0b57e835806d9ecbf9cf6a748a77) に integration を connect
- secret を `.env.local` の `NOTION_TOKEN=` に書く

### 2. Notion DB 自動生成

```bash
pnpm notion:setup
```

→ 11 個の DB が `LMS-DB` ページ配下に生成される + ID が出力される
→ 出力された 11 個の `NOTION_DB_*` を `.env.local` に貼る

### 3. CMS 初期データ投入

```bash
pnpm notion:import-cms
```

→ `gas/seed-data/*.tsv` の Course/Lesson/Test/Question/Choice を Notion に投入

### 4. Notion モードで動作確認

```bash
DATA_DRIVER=notion pnpm dev
```

→ `/dashboard` でコース一覧、視聴進捗、テスト受験 が Notion 経由で動くか

### 5. Vercel 本番デプロイ整備 (Phase G4)
- Vercel env に `NOTION_TOKEN` + `NOTION_DB_*` × 11 を設定
- `Deployment Protection` を Disable
- `DATA_DRIVER=notion` で再ビルド
- 動作確認

### 6. 会社 Notion 切替 (Phase G5)
会社の Notion 管理者から integration secret を取得後、env を差し替えるだけ:
- `NOTION_TOKEN` を会社用に
- `NOTION_PARENT_PAGE_ID` を会社の親ページに
- `NOTION_DB_*` を会社側で再生成 (`pnpm notion:setup` で自動)

---

## ⚠️ 注意点 / 既知の制約

### 性能制約 (Notion 全 DB 化の代償)
- Notion API: **3 req/秒** がアプリ全体の上限
- → 100 名同時動画視聴は不可、30 名同時程度が現実的
- → 視聴進捗保存は **30 秒間隔の write queue** で間引き済 (アプリ側 in-memory)
- → 50 名同時テスト受験すると採点に数分かかる

### トランザクションなし
- テスト提出途中でエラーが起きると **一部だけ書き込まれる** リスク
- → Submission 全体をまず作って status=IN_PROGRESS、Answer を順次作成、最後に status=PASSED/FAILED に更新する設計で軽減

### 既知のバグ
- `tests/unit/services/audit.spec.ts` の hash chain テストが **順序依存で 1 件失敗** することがある (Sprint #5 から既存)
  - 単独実行 (`vitest run audit.spec.ts`) では通る
  - 全体実行で他テストとの並列実行順序によって失敗
  - 影響度低だが Phase G3 (qa) で修正推奨

### Vercel デプロイは未完了
- 現状 https://lms-manager-training-...vercel.app にデプロイされているが Deployment Protection で 401
- DB が `/tmp/dev.db` で使い捨てなので、protection を解除しても User 周りで 500 になる
- → Notion 移行 (Phase G4) で env 切替えてから再デプロイ

---

## 🏗 アーキテクチャ (現在)

```
┌─────────────────────────────────────────────────────────┐
│  Next.js App (Vercel Fluid Compute)                    │
└──────┬──────────────────┬──────────────────┬───────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ ports/cms    │  │ ports/users  │  │ ports/audit      │
│ ports/test   │  │ ports/enroll │  │ ports/mail       │
│ ports/answer │  │ ports/prog   │  │ ports/storage    │
└──────┬───────┘  └──────┬───────┘  └──────┬───────────┘
       │                  │                  │
       │ adapters/{notion,local,spreadsheet,sqlite,stub}
       │ で切替可
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Notion       │  │ Prisma       │  │ GAS Web App      │
│ (Sprint #7   │  │ (User/Prog/  │  │ (Mail Relay      │
│  移行先)     │  │  Audit)      │  │  + 旧 CMS)       │
└──────────────┘  └──────────────┘  └──────────────────┘
```

切替軸 (環境変数):
- `DATA_DRIVER=notion` — 全 Port を Notion adapter に
- `DATA_DRIVER=sqlite-spreadsheet` (default) — 既存 (Spreadsheet CMS + Prisma 書込系)

---

## 🛠 開発フロー

### ブランチ運用
- `main` 直 push 禁止 (CLAUDE.md ルール)
- feature ブランチ → PR 作成 → CI 通過後マージ
- 過去の PR: #1 (Sprint #1-#6), #2 (startup-checks hotfix)

### Subagent 運用
このプロジェクトは Claude Code の Orchestrator + 専門 subagent で開発:
| name | 役割 |
| --- | --- |
| `architect` | 設計, ADR, スキーマ, API 仕様 |
| `backend` | Server Action, Route Handler, services, repositories |
| `frontend` | RSC ページ, shadcn/ui コンポーネント |
| `devops` | Vercel, env, CI/CD |
| `qa` | Vitest, Playwright |
| `security` | OWASP / 認可監査 |

`CLAUDE.md` に詳細あり。

---

## 📞 質問先 / リソース

- リポジトリ: https://github.com/kohnosuken-tech/lms-manager-training
- 過去の PR (議論履歴): https://github.com/kohnosuken-tech/lms-manager-training/pulls?q=is%3Apr
- ADR (意思決定の経緯): `docs/adr/` 配下を 0001 から順に
- 進捗 punch list の元データ: 過去のスプリント commit message に記載

---

## 🤝 引き継ぎ時の推奨アクション

1. **`README.md` を読む** (5 分) → 起動手順を試す
2. **このファイル (HANDOFF.md) を読む** (10 分) → 全体像を把握
3. **`docs/adr/0006-*.md` を読む** (10 分) → 現在進行中の Notion 移行の判断根拠
4. **ローカルで `pnpm dev` 起動 + 受講者 / 管理画面を触る** (15 分) → 機能の現物確認
5. **Phase G1 を実施** → Notion 移行の続きを引き継ぐ

合計 1 時間で引き継ぎ完了できる構成にしてあります。
