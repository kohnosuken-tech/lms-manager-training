# 0005. GAS Web App を CMS 読取 + メール送信の統合リレーとして使う

- Status: **Superseded by ADR 0006** (CMS 読取部分のみ)
- Date: 2026-05-02
- Author: architect subagent
- Related: ADR 0001, ADR 0003 (Spreadsheet を CMS), ADR 0004 (RDB 残置), `docs/decisions.md` §4 (メール)

> **2026-05-02 追記 (Superseded)**: CMS 読取機能 (`list_courses` 等) は ADR 0006 (Notion 全 DB 化) によって不要となり、GAS adapter は Phase G2 で削除される。
>
> ただし **メール送信機能 (`send_mail` action / `MailApp.sendEmail` リレー) は継続採用**。Notion でメール送信はできないため、GAS Mail Relay は LMS の MailPort 実装として残す (もしくは Phase 4 で Resend に切替)。詳細は `docs/architecture.md` §11.6 参照。

## Context

ADR 0003 で Spreadsheet を CMS にするにあたり、LMS (Vercel) → Spreadsheet 間の通信経路を決める必要がある。
候補:

1. LMS から Google Sheets API を直接叩く (OAuth サービスアカウント運用)
2. LMS から GAS Web App をリレー経由で叩く

`docs/decisions.md` §4 でメール送信は Resend に決まっているが、本プロジェクトでは「Google Workspace の `MailApp.sendEmail` (1500 通/日 / Workspace アカウント)」が使える環境にある。Resend ドメイン認証の作業を Phase 4 まで先送りしたい。GAS をリレーに採用すれば、**メール送信もそのまま GAS が引き受ける** ことができ、外部サービス契約数を 1 つ減らせる。

## Decision

GAS Web App を LMS の **統合リレー** として採用する。GAS は次の 2 つの責務を持つ:

(a) **Spreadsheet データ提供 API** — Course / Lesson / Test / Question / Choice の読取
(b) **メール送信** — `MailApp.sendEmail` ラッパー (招待、課題割当、リマインダ)

LMS からは **単一エンドポイント** (GAS Web App URL) に対し、以下のプロトコルで HTTP POST する:

### 1. プロトコル

- メソッド: `POST` のみ (`doPost(e)` で受ける)
- Content-Type: `application/json`
- 必須ヘッダ:
  - `X-Timestamp`: Unix epoch ミリ秒 (文字列)。**5 分以上のずれは拒否** (replay 攻撃防止)
  - `X-Signature`: `hex(HMAC-SHA256(body, GAS_SECRET))` (lowercase)
- リクエストボディ: `{ "action": "<action_name>", ...params }`
- レスポンス形式 (LMS の API と統一):
  ```json
  { "ok": true, "data": ... }
  // または
  { "ok": false, "error": { "code": "STRING", "message": "human readable" } }
  ```
- HTTP ステータスは GAS Web App の制約上常に `200`。判定は body の `ok` フィールドで行う。

### 2. action 一覧

| action | params | 戻り data | 概要 |
| --- | --- | --- | --- |
| `list_courses` | `{}` | `Course[]` | Course シート全件 (型変換済) |
| `list_lessons` | `{ courseId? }` | `Lesson[]` | Lesson シート、`courseId` 指定でフィルタ |
| `list_tests` | `{ courseId? }` | `Test[]` | Test シート |
| `list_questions` | `{ testId? }` | `Question[]` | Question シート |
| `list_choices` | `{ questionId? }` | `Choice[]` | Choice シート |
| `send_mail` | `{ to, subject, body, idempotencyKey }` | `{ accepted: true }` | `MailApp.sendEmail`。`idempotencyKey` で同一キーの再送を抑止 (24h, ScriptCache) |

将来追加候補:
- `health` (疎通確認, 認証不要にしてもよいが本 ADR では同じ HMAC 必須にする)
- `bulk_lookup` (id 配列で複数エンティティを 1 RTT で取得)

### 3. 認証 (HMAC-SHA256)

- LMS と GAS で **共有秘密 `GAS_SECRET`** (Vercel env と GAS ScriptProperties 両方に設定) を持つ。
- LMS 側送信:
  ```
  body = JSON.stringify({ action, ...params })
  ts   = String(Date.now())
  msg  = ts + "." + body          # ts と body を "." で結合
  sig  = HMAC-SHA256(msg, GAS_SECRET) → hex(lower)
  headers: X-Timestamp: ts, X-Signature: sig
  ```
- GAS 側検証:
  1. `X-Timestamp` を取得し、`Math.abs(now - ts) > 5*60*1000` なら 401 相当のエラーを返す
  2. `X-Signature` を取得
  3. 受信 body と ts から同じ手順で署名を再計算
  4. **constant time compare** (`Utilities.computeHmacSha256Signature` の結果 byte 配列を 1 byte ずつ XOR して合計が 0 か判定) で照合
  5. 不一致なら `{ ok: false, error: { code: "INVALID_SIGNATURE", ... } }` を返す

> 注: GAS Web App は HTTP ヘッダの一部 (例えば任意の `Authorization`) を制限なく受信できないケースがあるため、**カスタムヘッダ名は `X-` プレフィックス + GAS が `e.parameter` ではなく `e.postData` から body を取り出せる前提** で設計する。検証時の signature 計算は **必ず生 body** に対して行う (パース後の object に対しては行わない。鍵順が変わると一致しない)。

### 4. `send_mail` の信頼性 (fire-and-forget + 失敗追跡)

GAS 経由のメール送信は **best-effort**。LMS は同期的に成功確認を取りに行かず、以下のテーブルで自前追跡する:

```
model MailDelivery {
  id              String          @id @default(cuid())
  idempotencyKey  String          @unique
  to              String
  subject         String
  template        String          // "INVITE" | "ASSIGN" | "REMINDER"
  status          MailStatus      @default(PENDING) // PENDING | SENT | FAILED
  attemptCount    Int             @default(0)
  lastError       String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  sentAt          DateTime?

  @@index([status, createdAt])
}

enum MailStatus { PENDING SENT FAILED }
```

挙動:
1. LMS は送信前に `MailDelivery` を `PENDING` で insert (`idempotencyKey` で冪等)
2. GAS `send_mail` を呼び、成功時は `SENT` + `sentAt = now`、失敗時は `attemptCount++` + `lastError` を保存
3. 失敗が `attemptCount >= 3` なら `FAILED` に固定し、ADMIN ダッシュボードに警告
4. `idempotencyKey` の生成例:
   - 招待: `invite:${userId}`
   - 割当: `assign:${enrollmentId}`
   - リマインダ: `remind:${enrollmentId}:${YYYYMMDD}` (日次重複防止)

GAS 側の `idempotencyKey` も ScriptCache で 24h 持ち、同一キーの再送を **黙って ok を返す** (LMS のリトライ吸収)。

### 5. キャッシュ戦略

- LMS 側 `src/server/adapters/spreadsheet/cms.ts` に **in-memory キャッシュ** (5 分 TTL) を実装。
- Vercel Fluid Compute は warm のあいだ同一プロセス内でメモリを保持するため、社内 100 名規模のトラフィックでは十分。
- TTL 経過 / プロセス再起動でフォールスルーし GAS を叩く。
- KV や Redis は **将来必要になるまで導入しない** (YAGNI)。

### 6. レート制限への対応

| 制限 | 想定下での余裕 |
| --- | --- |
| URL Fetch 20,000/day | LMS 側 5 分キャッシュなら、5 entity × 12 calls/hour × 24h × N (Vercel リージョン数) = 数百〜千程度。十分余裕 |
| 6 分実行タイムアウト | 単一リクエストでは絶対に到達しない (Spreadsheet 5 シート読取は数秒) |
| 100 read/100 write per 100 sec | LMS 側キャッシュで実質ゼロに近い |
| MailApp 1500 通/日 (Workspace) | 100 ユーザー × 招待 1 + 割当 数回 + リマインダ日次 ≪ 1500。余裕 |

### 7. エラーコード (GAS → LMS)

| code | 意味 | 想定 HTTP 同等 |
| --- | --- | --- |
| `INVALID_SIGNATURE` | HMAC 不一致 | 401 |
| `EXPIRED_TIMESTAMP` | timestamp ずれ > 5 分 | 401 |
| `BAD_REQUEST` | action 不明 / params 不足 | 400 |
| `NOT_FOUND` | 指定 id がシートに存在しない | 404 |
| `MAIL_FAILED` | MailApp.sendEmail が throw | 500 |
| `INTERNAL` | その他 | 500 |

## Consequences

### 良い影響
- 認証 (HMAC) を 1 箇所に集約できる。LMS 側 adapter は 1 ファイルで完結。
- メール送信のために Resend ドメイン認証を Phase 4 まで先送りできる (本番でも GAS のメールで運用継続が可能)。
- GAS の責務が 2 種に閉じるため、コードベースが小さく審査しやすい。

### 悪い影響 / トレードオフ
- メール送信が GAS に同居することで、GAS 障害がメールにも影響する。`MailDelivery.status = FAILED` を ADMIN ダッシュボードで監視する運用が必要。
- HMAC 鍵 `GAS_SECRET` の rotation 手順を別途整備する必要 (Vercel env と ScriptProperties を同時更新)。
- GAS のレスポンスは常に HTTP 200 のため、`ok` フィールドを必ず確認する規約を adapter で強制。

### 将来の拡張に与える影響
- メール量が増えた / HTML テンプレート要件が出た場合、`MailPort` を GAS 実装から Resend 実装に差し替えるだけで対応可能 (port は ADR 0001 のパターン)。
- GAS をやめて Cloud Run などの薄いリレーに置き換える場合も、HMAC + action ベースのプロトコルは流用可能。

## Alternatives considered

- **Sheets API 直叩き + サービスアカウント**: OAuth 設定・鍵管理が増える。メール送信は別途 Resend 必須。
- **GAS は CMS 読取のみ、メールは Resend を Phase 1 から導入**: ドメイン認証作業のリードタイムが mock-first の進行を阻害する。
- **API Gateway を別建て (Cloudflare Workers など)**: 100 ユーザー規模では過剰。GAS で十分。
- **HMAC ではなく Bearer Token 単純比較**: replay 攻撃に弱い (timestamp なし)。HMAC + timestamp で replay 防止する。

## リスクと緩和

| リスク | 緩和 |
| --- | --- |
| `GAS_SECRET` が Git に漏出 | env / ScriptProperties のみで管理、コードに直書き禁止。CI で `git secrets` 等の hook |
| HMAC 検証実装ミス (タイミング攻撃) | constant time compare を実装。テストで 1 バイト違いケース複数を回す |
| GAS Web App URL が SNS 等に流出 | URL のみではアクセス不可 (HMAC 必須)。万一漏れたら redeploy で URL を変更する手順を準備 |
| ScriptProperties の `GAS_SECRET` が空 | `setupSheets()` 実行時に存在チェック、空なら明示エラー |
| GAS の障害でメール送信が止まる | LMS 側 `MailDelivery.status` 監視 + ADMIN 警告。リトライは別途 cron で再送 |
