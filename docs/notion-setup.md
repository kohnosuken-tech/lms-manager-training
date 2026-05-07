# Notion DB セットアップ手順 (個人 Notion → 会社 Notion)

> ADR 0006 で「全 DB を Notion に集約」する方針が決定しました。本ドキュメントは **エンジニアでない方** でも実施できるように、画面操作レベルで手順を記述しています。
>
> **進め方**: まず **個人 Notion** で全部動かす → ローカル / Vercel preview で動作確認 → 会社 Notion 整備後、env 11 個を差し替えるだけで本番切替。

---

## 全体像

```
[Step 1] 個人 Notion で Integration を作成 (5 分)
    ↓
[Step 2] 親ページを作成し、Integration を共有 (3 分)
    ↓
[Step 3] setup-notion スクリプトで 11 DB を自動生成 (5 分)
    ↓
[Step 4] env (Vercel / .env.local) に 12 個の値を設定 (10 分)
    ↓
[Step 5] ローカル動作確認 + preview デプロイ (15 分)
    ↓
[Step 6] (後日) 会社 Notion に同じ DB を作って env 差替え (5 分)
```

合計: 個人セットアップ約 40 分、会社移行 5 分。

---

## Step 1: 個人 Notion で Integration を作成

> Integration = LMS が Notion を読み書きするための「アカウント」のようなもの。

1. ブラウザで <https://www.notion.so/profile/integrations> を開く
2. 右上の **「新しいインテグレーション」(New integration)** をクリック
3. フォームを以下のように埋める
   - **名前 (Name)**: `LMS Dev (個人)` (任意の名前で OK)
   - **関連付けるワークスペース**: 自分の個人ワークスペースを選択
   - **タイプ (Type)**: `Internal` (既定値)
4. 「保存」をクリック
5. 作成された Integration の詳細画面で **「Internal Integration Secret」** をコピー
   - 形式: `secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **これが後で `NOTION_TOKEN` env に入る値**
   - 紛失したら同じ画面で「Show」→ 再表示できる

> [スクリーンショット placeholder: Integration 作成画面]

✅ Step 1 完了の確認: 手元に `secret_xxx` で始まる 50 文字程度のトークンがある

---

## Step 2: 親ページ作成 + Integration を共有

11 個の DB をまとめて配置する「親ページ」を作ります。Integration は親ページ経由でしか DB にアクセスできません。

1. 個人 Notion を開く
2. サイドバーの **「+ ページを追加」** をクリック → 新しい空白ページを作る
3. ページタイトルを `LMS Database` (任意) にする
4. ページ右上の **「・・・」(三点メニュー)** → **「コネクト」** → **`LMS Dev (個人)`** を選択して接続
5. ページ URL をブラウザのアドレスバーからコピー
   - 例: `https://www.notion.so/yourname/LMS-Database-1234abcd5678efgh9012ijkl3456mnop`
   - **末尾の 32 文字 (ハイフン直後)** が **page id**: `1234abcd5678efgh9012ijkl3456mnop`
   - これが後で `NOTION_PARENT_PAGE_ID` env に入る値

> [スクリーンショット placeholder: コネクト画面]

✅ Step 2 完了の確認: 親ページ URL から取り出した 32 文字の page id がある

---

## Step 3: setup-notion スクリプトで 11 DB を自動生成

> このスクリプトは **将来** `scripts/notion-setup.ts` として用意されます (Phase G1 で実装)。手動で作る代替手順も併記します。

### 3-A: スクリプトでの自動生成 (推奨、用意され次第)

```bash
# .env.local に NOTION_TOKEN と NOTION_PARENT_PAGE_ID を一時的に設定
echo 'NOTION_TOKEN=secret_xxx' >> .env.local
echo 'NOTION_PARENT_PAGE_ID=1234abcd...' >> .env.local

# スクリプト実行
pnpm tsx scripts/notion-setup.ts

# → 11 個の DB が親ページ配下に作成され、各 DB ID が console に出力される
# → 出力例:
# NOTION_DB_USER=aaaa1111bbbb2222cccc3333dddd4444
# NOTION_DB_COURSE=eeee5555ffff6666...
# ...
```

出力された 11 行をそのまま env に貼り付ければ Step 4 完了。

### 3-B: 手動で作る場合

`docs/architecture.md` §11.3 の **DB スキーマ表 11 個** を見ながら、Notion 上で手動で 11 個の DB を作成します。
property の **名前 (英字 ID)** と **type** を一字一句合わせる必要があります (大文字小文字含む)。

例: `User` DB
1. 親ページ内で `/database` → `Database — Full page`
2. DB タイトルを `User` にする
3. 既定の `Name` プロパティを `name` にリネーム (type=title のまま)
4. 「+ 列を追加」で以下を順に追加:
   - `id` → type=Text (rich_text)
   - `email` → type=Email
   - `role` → type=Select、オプションに `STUDENT` `ADMIN` を追加
   - `passwordHash` → type=Text
   - `clerkUserId` → type=Text
   - `sessionVersion` → type=Number
   - `deactivated` → type=Checkbox
   - `createdAt` → type=Date
   - `updatedAt` → type=Date
5. DB 右上の `・・・` → `Copy link to view` で URL を取得
6. URL の `?v=...` の **直前** に 32 桁の DB ID がある: `https://www.notion.so/yourname/<DB_ID>?v=...`
7. これを `NOTION_DB_USER=<DB_ID>` として控える

同じ要領で `Course`, `Lesson`, `Test`, `Question`, `Choice`, `Enrollment`, `Progress`, `Submission`, `Answer`, `AuditLog` を作成。

> [スクリーンショット placeholder: Notion で DB を作成し property を追加する手順]

⚠️ よくある間違い:
- **property 名のタイポ** (例: `userid` vs `userId`) — adapter が起動時に検証して落ちます
- **type の取り違え** (例: `email` を Text にしてしまう) — 同上
- 既定の `Name` プロパティ (title type) をそのまま残す必要あり (Notion の必須 property)

✅ Step 3 完了の確認: 手元に 11 個の DB ID (各 32 桁) がある

---

## Step 4: env を設定

### ローカル開発 (`.env.local`)

リポジトリ直下の `.env.local` に以下を追記 (なければ新規作成):

```dotenv
DATA_DRIVER=notion

NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PARENT_PAGE_ID=1234abcd5678efgh9012ijkl3456mnop

NOTION_DB_USER=aaaa1111bbbb2222cccc3333dddd4444
NOTION_DB_COURSE=...
NOTION_DB_LESSON=...
NOTION_DB_TEST=...
NOTION_DB_QUESTION=...
NOTION_DB_CHOICE=...
NOTION_DB_ENROLLMENT=...
NOTION_DB_PROGRESS=...
NOTION_DB_SUBMISSION=...
NOTION_DB_ANSWER=...
NOTION_DB_AUDIT_LOG=...

# メール送信は GAS のまま継続 (Notion で送信不可)
MAIL_DRIVER=gas
GAS_WEBAPP_URL=https://script.google.com/macros/s/.../exec
GAS_SECRET=（既存値）
```

⚠️ `.env.local` は **絶対に Git にコミットしない** (`.gitignore` で除外済)。

### Vercel 本番 / preview

Vercel ダッシュボード → Project → Settings → Environment Variables で同じ 12 個 (NOTION_* + DATA_DRIVER) を追加。
- Environments: `Production`, `Preview`, `Development` 全部にチェック
- `NOTION_TOKEN` は **Sensitive** にチェック

または CLI:
```bash
pnpm vercel env add NOTION_TOKEN
# プロンプトで値を貼り付け、対象環境を選択
```

✅ Step 4 完了の確認: `pnpm vercel env ls` で 12 個の NOTION_* 変数が見える

---

## Step 5: ローカル動作確認

```bash
# 依存をインストール (Phase G2 で @notionhq/client が package.json に追加される)
pnpm install

# 開発サーバ起動
pnpm dev
```

動作確認チェックリスト:
- [ ] `http://localhost:3000` が表示される
- [ ] サインインできる (seed ユーザーは別途 `pnpm tsx scripts/notion-seed.ts` で投入予定)
- [ ] コース一覧ページが Notion から取得した内容で表示される
- [ ] 動画再生中、10 秒後に Notion `Progress` DB に行が増える (30 秒バッファあり)
- [ ] テスト受験 → Submission + Answer が Notion に書き込まれる
- [ ] 何か操作するたびに `AuditLog` に行が増え、`hash` が前 record の `prevHash` と連鎖している

trouble shoot:
| 症状 | 原因 / 対処 |
| --- | --- |
| 起動時 `NOTION_PROPERTY_MISMATCH` | property 名 / type が DB スキーマ表と一致していない。Notion 側で修正 |
| `NOTION_NOT_FOUND` でコース 0 件 | 親ページに Integration が「コネクト」されていない / DB ID env が間違い |
| `RATE_LIMITED` が頻発 | < 30 名同時を超えている可能性。同時アクセスを減らす |
| Progress が反映されない | 30 秒バッファの仕様。1 分待っても来なければ Function ログを確認 |

✅ Step 5 完了の確認: ローカルで一通りの操作が Notion に反映される

---

## Step 6: 会社 Notion への切替 (個人で動作確認後)

会社 Notion ワークスペースが整備されたら以下を実施。**所要 5 分**。

1. **会社 Notion で同じ手順** を実施 (Step 1〜3)
   - 会社 Workspace で Integration `LMS Prod` を作成 → 新しい `secret_yyy` 取得
   - 会社 Workspace で「LMS Database」親ページ作成 → Integration コネクト
   - **個人 Notion と同じ property 構成** で 11 DB を作成 (`scripts/notion-setup.ts` を再実行が最速)

2. **Vercel env を上書き** (12 個):
   ```bash
   pnpm vercel env rm NOTION_TOKEN production
   pnpm vercel env add NOTION_TOKEN production
   # (会社の secret_yyy を貼り付け)
   # 同様に NOTION_PARENT_PAGE_ID と NOTION_DB_* × 11 を全部上書き
   ```

3. **再デプロイ**:
   ```bash
   pnpm vercel deploy --prod
   ```

4. 動作確認 (Step 5 と同じチェックリストを本番 URL で)

### データ移行 (任意)

個人 Notion のテストデータを会社 Notion に持ち込むかは選択:

- **A. 移行しない** (推奨): 会社で seed から作り直す。テストデータの汚染を避けられる
- **B. 移行する**: `scripts/notion-export.ts` (将来) で個人 Notion → JSONL → `scripts/notion-import.ts` で会社 Notion に投入

✅ Step 6 完了の確認: 本番 URL で会社 Notion 上の DB に書込みされる

---

## トラブル時のロールバック

会社 Notion 切替後に問題が出たら、Vercel env を **個人 Notion の値に戻して再デプロイ** すれば即座にロールバック可能 (5 分)。env のバージョン履歴は Vercel が保持しているため、個人の値は控えておくこと。

---

## 既存 Spreadsheet/GAS の扱い

| 機能 | 状態 |
| --- | --- |
| Spreadsheet (CMS) | Phase G2 完了で adapter 削除。シート自体は念のため残し、Phase G4 後に削除可 |
| `gas/seed-data/*.tsv` | **保持** (Notion 投入用 seed の元データ) |
| GAS `send_mail` | **継続使用** (Notion で送信不可のため) |
| Prisma / Neon | Phase G2 で削除予定 |

---

## 用語

- **Integration**: Notion の API アクセス用「アプリ」。Workspace 単位で作成
- **Internal Integration Token**: Integration を識別する secret。`secret_xxx` 形式
- **Page ID / Database ID**: Notion 上の URL に含まれる 32 桁の英数字
- **Property**: DB の列。型 (title / rich_text / number / select / date / checkbox / email / url) を持つ

---

## 参考

- ADR 0006: `docs/adr/0006-adopt-notion-as-only-database.md`
- Architecture §11: `docs/architecture.md`
- API spec §7: `docs/api-spec.md`
- Notion API 公式: <https://developers.notion.com/>
