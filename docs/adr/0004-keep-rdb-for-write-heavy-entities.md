# 0004. User / Progress / Submission / AuditLog はリレーショナル DB に残す

- Status: **Superseded by ADR 0006** (2026-05-02)
- Date: 2026-05-02
- Author: architect subagent
- Related: ADR 0001 (mock-first), ADR 0003 (Spreadsheet を CMS), ADR 0005 (GAS Web App リレー)

> **2026-05-02 追記 (Superseded)**: ADR 0006 で全データを Notion に集約することが決定。本 ADR で「RDB に残す」とした User/Enrollment/Progress/Submission/Answer/AuditLog はすべて Notion DB へ移行する (Phase G2)。性能上の妥協 (rate limit, トランザクション欠如等) と緩和策は ADR 0006 を参照。

## Context

ADR 0003 で `Course / Lesson / Test / Question / Choice` を Spreadsheet (GAS Web App 経由) に移すことを決めた。
残るエンティティ:

- `User`
- `Enrollment`
- `Progress`
- `Submission`, `Answer`
- `AuditLog`

これらも同じ Spreadsheet に置けば一元管理できそうに見えるが、以下の **書込特性** と **GAS の制約** を理由に、引き続きリレーショナル DB (モック = SQLite, 本番 = Neon Postgres) に残す判断をした。

### 書込頻度の見積もり

| エンティティ | 書込タイミング | 100 ユーザー想定の最悪ケース |
| --- | --- | --- |
| `Progress` | 動画再生中 10 秒間隔 | 100 同時視聴 × 6 req/min = **600 req/min** |
| `AuditLog` | ほぼすべての変更操作 | バースト時 数十 req/sec |
| `Submission` | テスト開始・採点提出 | 1 テスト = 1 トランザクション (Submission + Answer × N + 採点) |
| `Enrollment` | ADMIN の割当時 | 一括割当で 100 行 / 1 操作 |
| `User` | 招待・無効化・ロール変更 | 低頻度。ただし Clerk Webhook は突発バースト |

### GAS Web App の制約 (Workspace アカウント想定)

- URL Fetch service: **20,000 calls / day / consumer (作成者単位)**
- `UrlFetchApp` 経由の単一実行: **6 分タイムアウト**
- `SpreadsheetApp` API: 100 read + 100 write / 100 秒 / project
- 同時実行: 30 並列まで (それ以上は LockService で待機)
- **スクリプト全体の同時実行は 1 ユーザーあたり 30** が事実上の上限

仮に `Progress` を GAS 経由で書こうとすると、100 同時視聴で **600 req/min × 24h = 864,000 req/day** となり、URL Fetch の 20k/day 上限を **約 43 倍** 超過する。実装不能。

### トランザクション要件

`Submission` 採点処理 = 「Submission 状態更新 + Answer 一括 insert + score 算出 + AuditLog 追記」。
Spreadsheet には行レベルロックがなく、`LockService` でシート全体を直列化することはできるが、

- 採点中の他リクエストが全部待たされてユーザー体験が壊れる
- Lock 取得失敗 (10 秒タイムアウト) 時のリトライ戦略が複雑

になるため、原子性が求められる書込は **Postgres トランザクション** に任せる。

## Decision

以下のエンティティは **引き続き Prisma (mock = SQLite, prod = Neon Postgres) に残す**:

- `User` (Clerk userId と紐付け)
- `Enrollment`
- `Progress`
- `Submission`, `Answer`
- `AuditLog`

ADR 0003 で Spreadsheet に移したエンティティとの **参照は外部キー relation を持たない**。Spreadsheet 側エンティティの ID (cuid) を `string` カラムで保持するだけ:

| Prisma モデル | Spreadsheet 側参照カラム | relation の扱い |
| --- | --- | --- |
| `Enrollment.courseId` | Course.id | relation 削除、`@@index([courseId])` のみ |
| `Progress.lessonId` | Lesson.id | relation 削除、`@@index([lessonId])` のみ |
| `Submission.testId` | Test.id | relation 削除、`@@index([testId])` のみ |
| `Answer.questionId` / `Answer.choiceId` | Question.id / Choice.id | relation 削除、index のみ |

### 整合性の確保

外部キー制約がなくなる代わりに、以下のレイヤで整合性を担保する:

1. **書込時バリデーション** (services 層): `progressService.upsert()` は事前に `cms.listLessons()` で `lessonId` の存在を確認する。キャッシュ前提なので追加 RTT は無視できる。
2. **削除時の参照孤児**: ADMIN が Spreadsheet で Lesson 行を削除しても、`Progress.lessonId` は文字列として残る。これは **意図された挙動**: 過去の受講履歴は教材削除後も保持する (監査要件)。LMS 側で参照解決時に `null` を許容する UI とする。
3. **整合性チェック cron**: 日次 `/api/cron/integrity-check` (将来) で「Spreadsheet にない `lessonId` を参照する `Progress` 件数」を集計し閾値超過で警告。

## Consequences

### 良い影響
- Progress / AuditLog の高頻度書込は従来通り Prisma で安定動作。
- Submission のトランザクション一貫性が維持される。
- Postgres のクエリプランナと index で集計クエリ (ダッシュボード) の性能が確保される。

### 悪い影響 / トレードオフ
- 「コース定義は Spreadsheet」「受講履歴は Postgres」という二重管理になり、操作担当者は両方を見る必要がある。
  - ダッシュボード上で **両者を join した表示** をすることで運用上は意識させない (LMS 側で結合)。
- 外部キー制約による整合性保護を失う。代わりに services 層のバリデーションと cron 監視に依存。
- バックアップ手順が 2 系統 (Neon の自動 backup + Spreadsheet の Drive 履歴) になる。

### 将来の拡張に与える影響
- `Progress` を時系列 KPI として可視化したい場合、Postgres 側にあるおかげで TimescaleDB 等への移植が容易。
- AuditLog を SIEM (例: Datadog Audit Trail) へ転送する場合も Postgres 側 CDC で対応可能。

## Alternatives considered

- **全エンティティを Spreadsheet に集約**: 上記 GAS 制限により不能。
- **全エンティティを Postgres に戻す (= ADR 0003 を破棄)**: Spreadsheet を CMS にする旨味 (ADMIN が直接編集) を失う。教材編集 UI を別途実装する工数が発生。
- **CMS を Postgres、書込系を Spreadsheet**: 順序が逆。Spreadsheet を書込系にする方が制限に当たる頻度が圧倒的に高い (Progress)。

## Prisma スキーマ縮小計画 (要約)

詳細マイグレーション SQL は `docs/architecture.md` §10 に記載。

削除するモデル:
- `Course`
- `Lesson`
- `Test`
- `Question`
- `Choice`

縮小するモデル (relation を string FK に置換):
- `Enrollment` (`course Course` → `courseId String` のみ)
- `Progress` (`lesson Lesson` → `lessonId String` のみ)
- `Submission` (`test Test` → `testId String` のみ)
- `Answer` (`question Question` / `choice Choice` → `questionId String` / `choiceId String` のみ)

維持するモデル:
- `User`, `AuditLog` (変更なし)

削除する Enum:
- `QuestionType` (= GAS 側で管理: SINGLE / MULTIPLE)

維持する Enum:
- `Role`, `SubmissionStatus`, `AuditAction`

## リスクと緩和

| リスク | 緩和 |
| --- | --- |
| `lessonId` 参照孤児が増える | 日次 cron で integrity-check、LMS UI は `null` 表示で握り潰し |
| Spreadsheet 編集中に LMS 側で in-flight な書込衝突 | 衝突しない。Postgres と Spreadsheet は別エンティティ。Spreadsheet 側 ID を変えなければ無関係 |
| Spreadsheet で id 列を ADMIN が編集 / 重複させる | GAS の `setupSheets()` で id 列に「重複禁止」のデータ検証を入れる。LMS 側 cms adapter でも重複検出 |
