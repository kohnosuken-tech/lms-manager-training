# 研修 LMS (Learning Management System)

社内マネージャー (約 100 名) 向けの動画教材配信・視聴進捗管理・条件付きテスト機能を提供する LMS。Mock-first 開発で進めており、現在 Notion 全 DB 化への移行中。

> 📋 **引き継ぎ資料**: [HANDOFF.md](./HANDOFF.md) を参照してください。現在の進捗 / 残作業 / 注意点が整理されています。

---

## 技術スタック

| 領域 | 採用 |
| --- | --- |
| Framework | Next.js 16 (App Router, TypeScript strict) |
| Runtime | Vercel Fluid Compute (Node.js 24 LTS、Edge は不使用) |
| UI | shadcn/ui + Tailwind CSS v4 + sonner Toaster |
| 認証 | Cookie session (jose JWT) — mock。本番は Notion User DB へ |
| データ (現在) | Prisma + SQLite (User/Progress/Audit) + Google Spreadsheet (教材) |
| データ (移行先) | **Notion 全 DB 化** (Sprint #7 で進行中) |
| メール | GAS Web App relay (HMAC + idempotency) |
| 動画 | YouTube IFrame Player + ファイルアップロード対応 |
| テスト | Vitest (unit / component) + Playwright (E2E) |
| CI/CD | GitHub Actions + Vercel Git Integration |

---

## ディレクトリ構成

```
.
├── docs/                       # 設計ドキュメント
│   ├── adr/                    # Architecture Decision Records (0001-0006)
│   ├── architecture.md         # システム構成
│   ├── api-spec.md             # API 仕様
│   ├── requirements.md         # 要件
│   ├── deployment-gas.md       # GAS Web App デプロイ手順
│   └── notion-setup.md         # Notion セットアップ手順
├── prisma/
│   ├── schema.prisma           # User/Progress/Audit (CMS は Notion/Spreadsheet)
│   └── migrations/             # 初回 init / sessionVersion / audit-hash-chain / drop-cms
├── gas/
│   ├── Code.gs                 # GAS Web App (HMAC + 5 シート読取 + メール送信)
│   └── seed-data/              # 教材初期データ (TSV)
├── scripts/
│   ├── setup-notion.ts         # Notion 11 DB 自動生成
│   ├── notion-import-cms.ts    # 教材データ Notion 投入
│   └── verify-audit-chain.ts   # 監査ログ改ざん検知
├── src/
│   ├── app/                    # Next.js App Router
│   ├── components/             # shadcn/ui composition
│   ├── lib/                    # logger, errors, utils
│   └── server/
│       ├── ports/              # 抽象インターフェース (CmsPort / UserPort / ...)
│       ├── adapters/
│       │   ├── stub/           # mock 用 (cookie auth, console.log mail, ...)
│       │   ├── local/          # TSV fixture 読込 (CMS)
│       │   ├── spreadsheet/    # GAS 経由 (CMS / Mail)
│       │   └── notion/         # Notion API (Sprint #7 で実装、全 DB 移行中)
│       └── services/           # 業務ロジック
└── tests/                      # Vitest + Playwright
```

---

## 起動手順 (ローカル開発)

### 前提
- Node.js 24+ (推奨: nvm で管理)
- pnpm 9+

### 1. 依存インストール

```bash
pnpm install
```

### 2. `.env.local` を作成

`.env.example` をコピーしてローカル用に編集:

```bash
cp .env.example .env.local
```

最低限の動作には以下があれば OK (mock モード):

```env
DATABASE_URL="file:./dev.db"
APP_MODE=stub
SESSION_SECRET=dev-secret-change-me-32chars-long-please
CMS_SOURCE=local
```

### 3. DB 初期化 + seed

```bash
pnpm exec prisma migrate dev
pnpm db:seed
```

### 4. dev 起動

```bash
pnpm dev
# http://localhost:3000 (もしくは 3001)
```

### 5. ログイン (mock)

任意のパスワードで OK:
- `admin@example.com` (ADMIN)
- `student1@example.com` `student2@example.com` `student3@example.com` (STUDENT)

---

## 主要スクリプト

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | dev サーバー起動 (Turbopack) |
| `pnpm build` | 本番ビルド |
| `pnpm test` | Vitest unit/component (244 件) |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm db:migrate` | Prisma マイグレーション |
| `pnpm db:seed` | mock データ投入 |
| `pnpm notion:setup` | Notion 11 DB 自動生成 (Sprint #7) |
| `pnpm notion:import-cms` | 教材データを Notion に投入 |

---

## 開発モード切替

環境変数で動作モードを切替できます:

| 変数 | 値 | 内容 |
| --- | --- | --- |
| `APP_MODE` | `stub` (default) / `prod` | 認証スタブ / Clerk 実装 |
| `CMS_SOURCE` | `local` (default) / `spreadsheet` | TSV fixture / GAS 経由 |
| `MAIL_DRIVER` | `stub` (default) / `gas` | console.log / GAS Web App 送信 |
| `DATA_DRIVER` | `sqlite-spreadsheet` (default) / `notion` | 既存構成 / Notion 全 DB |

---

## ドキュメント

- [HANDOFF.md](./HANDOFF.md) — **引き継ぎ向けの最重要ドキュメント**
- [docs/requirements.md](./docs/requirements.md) — 要件定義
- [docs/architecture.md](./docs/architecture.md) — システム構成 (現在 / Notion 移行後)
- [docs/api-spec.md](./docs/api-spec.md) — API 仕様
- [docs/adr/](./docs/adr/) — 6 本のアーキテクチャ意思決定記録
- [docs/notion-setup.md](./docs/notion-setup.md) — Notion セットアップ手順 (Sprint #7)
- [docs/deployment-gas.md](./docs/deployment-gas.md) — GAS Web App デプロイ手順
- [CLAUDE.md](./CLAUDE.md) — Claude Code (AI) 用プロジェクト指示書

---

## ライセンス

社内利用のみ (Private/Internal).
