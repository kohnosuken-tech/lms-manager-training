# Vercel デプロイ手順

mock-first フェーズで完成したコードを Vercel 本番環境に上げる手順。
所要時間: **半日〜1 日** (Marketplace 連携 4 つ + コード差し替え + 動作確認)

---

## 0. 前提

- GitHub リポジトリ: https://github.com/kohnosuken-tech/lms-manager-training (Private)
- ローカル動作確認済 (`pnpm dev --port 3010`)
- 月額予算: $50〜100 (Vercel Pro + Neon Scale + Clerk Pro + Resend Pro)
  - 初期は **すべて無料プラン** で動かして、本番運用前に有料化でも可

---

## 1. Vercel プロジェクト作成

1. https://vercel.com/signup で **GitHub アカウントでサインアップ**
2. dashboard で **「Add New」→「Project」**
3. **Import Git Repository** で `lms-manager-training` を選ぶ
4. Framework Preset: **Next.js** を確認 (自動検出)
5. **Build Settings** はデフォルトのまま (vercel.ts が自動認識される)
6. **Environment Variables** はこの段階では未設定で OK (Marketplace install 時に自動注入される)
7. **「Deploy」** を押す → 初回ビルドは `APP_MODE=stub` のままで成功する (mock 動作だがデプロイ自体は通る)

---

## 2. Vercel CLI セットアップ (ローカル開発用)

```bash
# CLI インストール
npm i -g vercel

# プロジェクトリンク (リポジトリルートで)
cd /Users/pieceofcake/マネージャー_研修eラーニング
vercel link

# Marketplace integrations 後に env を pull
vercel env pull .env.local
```

---

## 3. Marketplace integrations 4 つを install

Vercel dashboard の対象プロジェクト → **「Storage」 / 「Integrations」** タブから順に追加。

### 3.1 Neon Postgres (DB)

1. **Storage → Browse Marketplace → Neon → Create**
2. プラン: **Free** で開始 (300 時間/月)
3. プロジェクト名: `lms-manager-training-db`
4. region: `ap-northeast-1` (東京) または近い region
5. install 完了で `DATABASE_URL`, `DIRECT_URL` などが自動注入される

**DB マイグレーション (初回のみ):**

```bash
vercel env pull .env.local  # DATABASE_URL を local にも持ってくる
~/Library/pnpm/pnpm exec prisma migrate deploy

# 初回 ADMIN を作成 (CLI から SQL 直接 INSERT)
~/Library/pnpm/pnpm exec prisma studio
# → User テーブルに admin 1 名を追加 (email + name + role=ADMIN)
```

> ⚠️ `prisma/schema.prisma` の `provider` を `sqlite` → `postgresql` に変更してから migrate 必要。
> SQLite と Postgres は migration 互換性がないため、`prisma/migrations/` を削除して `prisma migrate dev --name init` で再生成。

### 3.2 Clerk (認証)

1. https://clerk.com/signup → Free プランでアカウント作成
2. Vercel dashboard → **Integrations → Browse → Clerk → Add Integration**
3. Vercel project に紐付け → `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 自動注入
4. Clerk dashboard で:
   - **Email + Password** を有効化 (社内 LMS 想定)
   - **MFA (TOTP)** を opt-in で有効化
   - **Webhook**: `https://<your-domain>/api/webhooks/clerk` を `user.created`, `user.updated`, `user.deleted` で登録
   - **Webhook secret** をコピーして Vercel env `CLERK_WEBHOOK_SECRET` に設定

### 3.3 Vercel Blob (動画ストレージ)

1. Vercel dashboard → **Storage → Browse Marketplace → Vercel Blob → Create**
2. プラン: **Free** (1 GB ストレージ + 1 GB 帯域/月)
3. install 完了で `BLOB_READ_WRITE_TOKEN` 自動注入
4. **Privacy: private** に設定 (動画は署名 URL 経由のみ配信)

### 3.4 Resend (メール)

1. https://resend.com/signup → Free プラン (3000 通/月)
2. Vercel dashboard → **Integrations → Browse → Resend → Add**
3. `RESEND_API_KEY` 自動注入
4. Resend dashboard で **送信ドメインを verify** (例: `lms.example.com` を DNS の TXT レコード設定で認証)
5. From アドレス: `noreply@lms.example.com` などを決める

---

## 4. 環境変数の追加設定 (手動)

Vercel dashboard → **Settings → Environment Variables** で以下を手動追加:

```
APP_MODE=prod
SESSION_SECRET=<32文字以上のランダム文字列>  # openssl rand -base64 32
CRON_SECRET=<32文字以上のランダム文字列>     # openssl rand -base64 32
NEXT_PUBLIC_APP_URL=https://<your-domain>
MAIL_FROM=noreply@<your-domain>
```

**Production / Preview / Development で適切に振り分け** (mock を local で続けたいなら development は `APP_MODE=stub` のまま)

---

## 5. prod アダプタを実装 (コード作業)

`src/server/adapters/prod/*.ts` は scaffold (throw) のみ。env が揃ったら以下を実装:

### 5.1 依存追加

```bash
~/Library/pnpm/pnpm add @clerk/nextjs @vercel/blob resend svix
```

### 5.2 各アダプタ実装

| ファイル | やること |
| --- | --- |
| `src/server/adapters/prod/auth.ts` | `auth()` を呼んで Clerk session を `User` 型に変換。User 同期は webhook 側 |
| `src/server/adapters/prod/storage.ts` | `@vercel/blob` の `put()`, `del()`, `getDownloadUrl()` (signed URL TTL 10 分) |
| `src/server/adapters/prod/mail.ts` | `Resend` SDK の `emails.send()` |
| `src/app/api/webhooks/clerk/route.ts` | `svix` で署名検証 → User upsert/delete |

### 5.3 container.ts 切替

```ts
// src/server/container.ts
const isProd = process.env.APP_MODE === "prod";
export const container = isProd ? prodContainer : stubContainer;
```

prodContainer から hard-fail proxy を外し、各 prod アダプタを実装版に差し替える。

### 5.4 Prisma スキーマ拡張

```prisma
model User {
  // ...
  clerkId String? @unique  // Clerk Webhook で同期
}
```

`prisma migrate dev --name add-clerk-id` でマイグレーション作成 → main マージで本番反映。

---

## 6. 動作確認

### Preview デプロイで確認 (PR 単位)

1. `phase4-prod` ブランチを切って prod アダプタ実装をコミット
2. PR を作成すると Vercel が自動 preview deploy
3. Preview URL でログインから動画再生まで通すこと
4. preview の env は `Preview` スコープなので、production を汚さず試せる

### 本番デプロイ (main マージ)

1. PR をマージ → main → 自動 production deploy
2. Rolling Release を有効化 (Vercel dashboard → Deployments → Rolling Release Settings)
   - 初回は 10% → 50% → 100% を 30 分かけて段階公開
3. **Post-deploy チェック:**
   - https://<domain>/sign-in でログイン
   - https://<domain>/admin で管理画面表示
   - 動画 1 本アップロードして再生
   - リマインダ cron は `vercel cron logs` で 24h 待ってから確認

---

## 7. 独自ドメイン

```bash
vercel domains add training.example.com
```

または Vercel dashboard → **Settings → Domains** で追加。
Cloudflare/Route 53 等の DNS で CNAME を Vercel に向ける。

---

## 8. 日々の運用

### デプロイ
- main マージ = 本番デプロイ (Rolling Release)
- 緊急時は Vercel dashboard → Deployments → 過去 deploy を **Promote to Production** で即ロールバック

### env 変更
```bash
vercel env add MY_VAR production
vercel env pull .env.local  # ローカルにも反映
```

### ログ
```bash
vercel logs <deployment-url>  # CLI
# または dashboard → Deployments → 該当 deploy → Functions タブ
```

### バックアップ
- Neon は **Point-in-Time Recovery 7 日** が Free プランで自動。Pro で 14 日に延長
- Blob は冗長化されているが、誤削除には別 storage への定期 sync を検討
- Audit Log は DB 内なので Neon backup に含まれる

---

## 9. 残タスク (Phase 4 後の改善)

| 優先度 | 項目 | 理由 |
| --- | --- | --- |
| 高 | CSP nonce 化 | `'unsafe-inline'` を排除して XSS 対策強化 |
| 高 | Audit Log の DB 制約 | Postgres trigger で UPDATE/DELETE を block |
| 中 | Vercel BotID で sign-in 保護 | brute force 対策 |
| 中 | メール非同期化 (Vercel Queues) | 大量送信時の Function timeout 回避 |
| 中 | Sentry 等のエラートラッキング | cron 失敗の通知 |
| 低 | i18n (英語対応) | 海外拠点があれば |

---

## 10. トラブルシュート

| 症状 | 原因 / 対処 |
| --- | --- |
| `[Phase4] xxx adapter not implemented` で 500 | prod アダプタ未実装。`src/server/adapters/prod/*.ts` を実装 |
| `/admin` で `/sign-in` に飛ばされる | Clerk セッションが切れている。Clerk dashboard で session 設定を確認 |
| 動画再生が遅い | Vercel Blob のリージョンと Function のリージョンが合っているか確認 |
| Cron が走らない | `vercel.ts` の `crons` 設定 + Vercel dashboard の Cron タブで有効化されているか |
| メールが届かない | Resend の送信ドメイン verify を確認。`MAIL_FROM` が verified domain か |

---

## 参考リンク

- Vercel Marketplace: https://vercel.com/marketplace
- Clerk + Next.js App Router: https://clerk.com/docs/quickstarts/nextjs
- Neon Postgres + Prisma: https://neon.tech/docs/guides/prisma
- Vercel Blob: https://vercel.com/docs/storage/vercel-blob
- Resend Next.js: https://resend.com/docs/send-with-nextjs
