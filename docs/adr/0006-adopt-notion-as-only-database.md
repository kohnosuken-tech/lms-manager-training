# 0006. Notion を唯一の DB として採用する (性能・機能の妥協受け入れ)

- Status: Accepted
- Date: 2026-05-02
- Author: architect subagent
- Related: ADR 0001 (mock-first), ADR 0002 (auth)
- Supersedes: ADR 0003 (Spreadsheet を CMS), ADR 0004 (RDB を書込系に残す), ADR 0005 (GAS Web App リレー)

## Context

ADR 0003〜0005 で「Spreadsheet=CMS / RDB=書込系」という二重構成を採用していた。本案は **「全データを Notion DB に集約」** に方針転換する。

### 方針転換の理由
- 社内 SaaS を **Notion 一本化** したい (ドキュメント・タスク管理含めた統合)
- ADMIN が **Notion 画面で直接編集** したい (Spreadsheet より UX が高い)
- Spreadsheet → Notion 切替が社内承認済み
- 個人 Notion アカウントで開発 → 動作確認後、会社 Notion に env 差替えで移行する運用が確定
- 規模: 個人テスト時 1〜5 名同時 / 本番でも < 30 名同時で可
- 「Notion 全 DB は性能上不可」という前回判定を、**性能と機能の妥協を明示的に受け入れる** ことで上書きする

## Decision

LMS の **全エンティティを Notion DB として管理** する。Prisma / Neon / Spreadsheet / GAS は **段階廃止** (Phase G 完了で停止)。

### 11 個の Notion DB
- CMS 系 (5): `Course`, `Lesson`, `Test`, `Question`, `Choice`
- アプリ系 (6): `User`, `Enrollment`, `Progress`, `Submission`, `Answer`, `AuditLog`

### 設計指針
1. **id は cuid (string)** を `rich_text` プロパティで管理。Notion page id は使わない
2. **relation property は使わない** (双方向同期遅延・page id 依存になるため)。参照は cuid 文字列で持つ
3. **select は事前定義値** (`STUDENT`/`ADMIN`, `IN_PROGRESS`/`PASSED`/`FAILED` 等)
4. **date 型は ISO8601 string** (Notion `date` プロパティ)
5. アクセスは Notion 公式 API (`@notionhq/client`) のみ。adapter 層に閉じる

### env 1 行で個人 ⇔ 会社切替
```
NOTION_TOKEN=secret_xxx              # 個人 → 会社で差替え
NOTION_PARENT_PAGE_ID=...
NOTION_DB_USER=...
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
```

## 妥協リスト (明示)

| 妥協 | 内容 | 受容理由 |
| --- | --- | --- |
| Rate limit | Notion API は **平均 3 req/s / Integration**、burst でも数秒 | < 30 名同時ならスロットルで吸収可 |
| トランザクション欠如 | 採点 (Submission + Answer × N) が原子的に書けない | 失敗時の補償ロジック + 冪等キーで緩和 |
| 集計性能 | `count`, `sum` は Notion 側にない。LMS 側で全件取得後に集計 | DB 件数 < 数千なら 5 分キャッシュで耐える |
| ユニーク制約欠如 | `User.email` 重複を DB が拒めない | 書込前に同期 lookup + 楽観的衝突再試行 |
| 参照整合性なし | 関連 page 削除時の自動クリーンアップなし | 監査要件 (履歴保持) 上、孤児を残すのは許容 |
| 100 名同時動画視聴 | **不可能**。Progress 書込が rate limit を超える | 規模を < 30 名同時に限定。超えたら設計再検討 |
| ページネーション必須 | 1 リクエスト 100 件上限 | 一覧系は LMS 側で `start_cursor` ループ |

## 緩和策

### (a) 書込スロットル
- アプリ側 token bucket (3 req/s, burst 5) を全 Notion API 呼出に共通適用
- 実装: `src/server/adapters/notion/rate-limiter.ts` (Phase G2 で backend が実装)

### (b) 書込キュー (in-memory, 30 秒バッファ)
- `Progress` (高頻度更新) はクライアントから 10 秒間隔で受信 → サーバ in-memory キューに 30 秒バッファ → 同 `(userId, lessonId)` の最終値だけを書込
- **ベストエフォート**: Vercel Function 再起動でロスト可
- 補完: クライアント側 localStorage に直近値を保存し、次回ロード時に再送

### (c) 読込キャッシュ
| エンティティ | TTL |
| --- | --- |
| Course / Lesson / Test / Question / Choice | 5 分 |
| User / Enrollment | 30 秒 |
| Progress / Submission / Answer | キャッシュなし |

### (d) AuditLog の hash chain
- 直前 record の `hash` を取得 → 新 record の `prevHash` に格納 → `hash = sha256(prevHash + payload)` を計算 → write
- Notion 上の **作成日時降順 1 件取得** で前 record を取得
- 順序保証は時刻ベース (Notion の writeAt 単調性に依存。同一秒内同時書込時は再計算リトライ)

## Consequences

### 良い影響
- 社内ツール一本化。教材・受講履歴を Notion で串刺しで閲覧可能
- ADMIN が Notion UI でユーザー追加・割当・進捗確認を直接できる
- インフラ最小化 (Vercel + Notion のみ)。Neon / GAS / Spreadsheet 不要
- 個人 Notion → 会社 Notion 移行が **env 差替え 5 分** で完了する設計

### 悪い影響
- 100 名同時視聴は不可。規模制約を明示する必要
- Notion 障害時に LMS 全停止 (回復策: 一時的な in-memory リプレイのみ)
- 集計クエリは LMS 側でのフルスキャン。万単位で遅くなる
- 採点トランザクションは best-effort (補償ロジックで担保)

### 将来
- Notion がボトルネック化したら、`NotionPort` の adapter を Postgres 実装に差替えるだけで戻せる (port 設計を維持)

## Alternatives considered

- **案 C (前回採用): Spreadsheet=CMS / RDB=書込系** — Spreadsheet→Notion 切替の社内合意により破棄
- **Notion=CMS のみ / 書込系は RDB** — 二重管理が残る。社内一本化の意図に反する
- **Postgres 単独 + 管理画面自作** — 工数大、Notion UX に劣る

## リスクと緩和

| リスク | 緩和 |
| --- | --- |
| Rate limit 超過 (3 req/s) | スロットル + 30 秒バッファ + キャッシュで実質 < 1 req/s に抑制 |
| Notion API 障害 | LMS は 503 を返し、クライアント側でリトライ。Progress は localStorage 保持 |
| 個人 Notion アカウント停止 | 会社 Notion 移行手順を `docs/notion-setup.md` に明記。データ export スクリプト整備予定 |
| ADMIN が DB property を改名 | LMS adapter が起動時に property name を検証、不一致なら起動失敗 |
| ユニーク制約欠如による email 重複 | createUser 前に `emailExists()` lookup + 衝突時の再試行 |
| AuditLog hash chain 改ざん | `scripts/verify-audit-chain.ts` を Notion 対応に書換 (backend が Phase G2) |
