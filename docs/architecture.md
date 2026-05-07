# アーキテクチャ概要

> 100 名規模・社内利用の LMS。Mock-first で実装し、Phase 4 で本番統合に差し替える。

## 1. スタック

| レイヤ | 採用 |
| --- | --- |
| Framework | Next.js 16 App Router (TypeScript strict) |
| Runtime | Vercel Fluid Compute (Node.js 24 LTS), Edge は不使用 |
| DB | 本番: Neon Postgres / モック: SQLite (`file:./dev.db`) |
| ORM | Prisma (provider は postgresql 固定) |
| Auth | 本番: Clerk + Vercel BotID / モック: cookie session スタブ |
| Storage | 本番: Vercel Blob (private + 署名 URL) / モック: `public/sample.mp4` |
| Mail | 本番: Resend / モック: `console.log` |
| UI | shadcn/ui + Tailwind v4 |
| Cron | Vercel Cron → `/api/cron/*` |
| Test | Vitest + Testing Library + Playwright |

## 2. ランタイム配置 (本番想定)

```
[ Browser ]
    | HTTPS
    v
[ Vercel Edge Network ]  -- BotID (login pages)
    |
    v (Fluid Compute, Node.js 24)
+-------------------------------------------+
| Next.js App Router                        |
|  - Server Components (一覧/集計の描画)     |
|  - Server Actions  (フォーム送信)          |
|  - Route Handlers  (/api/progress, cron, |
|                     csv export, webhooks) |
+-------------------------------------------+
   |                |                   |
   v                v                   v
[ Clerk ]       [ Neon PG ]       [ Vercel Blob ]
                via Prisma          private + signed URL
                                          ^
                                          | webhook
                                    [ Resend ] (送信)
                                    [ Vercel Cron ] (日次)
```

モックは同じ Next.js プロセス内にスタブ実装を内包する (外部接続なし)。

## 3. ports & adapters

外部依存 (Auth, Mail, Storage, Logger) は `src/server/ports/*.ts` に **interface (port)** として定義し、`src/server/adapters/{stub,prod}/*.ts` に実装を置く。`src/server/container.ts` が `process.env.APP_MODE` で切替。呼び出し側 (services / route handlers) は port のみ知る。

## 4. 主要リクエストフロー

### 4.1 ログイン
1. `/sign-in` (Server Component) → form submit (Server Action)
2. `authPort.signIn(email, password)` を呼ぶ
   - stub: cookie 検証 + seed ユーザー lookup
   - prod: Clerk SDK
3. 成功時、`User.id` を `session` cookie に書き込み redirect
4. `auditPort.write({ action: USER_LOGIN, actorId })`

### 4.2 動画視聴 + 進捗保存
1. `/courses/[id]/lessons/[lessonId]` (Server Component) で `User`, `Lesson`, `Progress` を取得 (Prisma)
2. クライアント `<VideoPlayer>` が 10 秒間隔で `/api/progress` (Route Handler) に POST
3. 入力 zod validation → `progressService.upsert(userId, lessonId, watchedSec, lastPositionSec)`
4. `watchedSec / durationSec >= requiredCompletionRate ?? 0.95` で `completed = true`
5. blockSeek = true の Lesson は前方シークを 422 で拒否

### 4.3 テスト受験 + 採点
1. ADMIN が `Test`, `Question`, `Choice` を作成 (Server Action)
2. STUDENT が `/tests/[id]` 開始 → `Submission` (status=IN_PROGRESS) を作成
3. 出題は Server Component で `shuffleQuestions=true` 固定でシャッフル、`Choice` も shuffle
4. submit (Server Action) で `Answer` 一括 insert → 自動採点
   - 部分点なし。問題ごとに「選んだ集合」と「正解集合」が完全一致のみ正解
   - score = 正解数 / 全問数 * 100、`status = score >= passingScore ? PASSED : FAILED`
5. 結果ページで解説 (`Question.explanation`) を表示
6. 再受験は `attemptNo < maxAttempts` のときのみ許可

### 4.4 CSV エクスポート (ADMIN)
1. `/admin/reports/export?type=progress` (Route Handler)
2. `requireAdmin()` → Prisma 集計クエリ → `text/csv` でストリーミング応答
3. `auditPort.write({ action: EXPORT_CSV })`

## 5. モック vs 本番

| 領域 | モック | 本番 | 切替時の作業 |
| --- | --- | --- | --- |
| Auth | cookie session, seed ユーザー | Clerk + BotID | adapter を `clerk` に切替、Clerk webhook で User 同期 |
| DB | SQLite (`file:./dev.db`) | Neon Postgres | `DATABASE_URL` 切替 + `prisma migrate deploy` |
| 動画 | `/public/sample.mp4` 固定 | Vercel Blob (private) | アップロード UI 実装、署名 URL 発行 |
| Mail | `console.log` | Resend SDK | adapter 差替、テンプレート整備 |
| Bot 保護 | なし | Vercel BotID | sign-in route に BotID middleware |
| 集計 | Server Component で Prisma 集計 | 同左 (リアルタイム) | 変更なし |
| 完了率 | 0.95 既定, Lesson で上書き可 | 同左 | 変更なし |

## 6. ディレクトリ構成 (予定)

```
.
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (student)/          # 受講者画面
│   │   ├── admin/              # 管理画面
│   │   └── api/
│   │       ├── progress/route.ts
│   │       ├── cron/reminders/route.ts
│   │       └── admin/export/route.ts
│   ├── server/
│   │   ├── ports/              # interface (auth, mail, storage, logger)
│   │   ├── adapters/
│   │   │   ├── stub/           # モック実装
│   │   │   └── prod/           # Clerk / Resend / Blob
│   │   ├── services/           # ビジネスロジック (progress, grading, ...)
│   │   ├── repositories/       # Prisma アクセス層
│   │   ├── auth.ts             # requireUser / requireAdmin / getCurrentUser
│   │   └── container.ts        # adapter 選択
│   ├── lib/                    # zod schemas, logger, csv util
│   └── components/             # shadcn/ui composition
├── tests/
└── docs/
```

## 7. 設計原則 (要点)

- **Server Component 優先**: 一覧・集計はすべて Server Component で Prisma 直接呼び出し。
- **Server Action**: フォーム送信・状態変更系。zod でバリデーション。
- **Route Handler**: 動画進捗 (高頻度), Cron, Webhook, CSV ストリーム。
- **レスポンス形式**: `{ ok: true, data } | { ok: false, error: { code, message } }`
- **N+1 回避**: Prisma の `include` / `select` を必ず指定。
- **監査**: 変更系操作はサービス層で `auditPort.write` を呼ぶ。
- **エラー**: 既知エラーは `AppError(code, message, status)` を throw、ハンドラで上記レスポンス形式に変換。

---

## 8. Spreadsheet (GAS Web App) を CMS とする構成 — ADR 0003 / 0005

> 2026-05-02 追記。ADR 0003 で Course / Lesson / Test / Question / Choice の定義データを Google Spreadsheet に移すことを決定。
> ADR 0005 で LMS ⇔ Spreadsheet 間に GAS Web App をリレーとして挟むことを決定。

### 8.1 ランタイム配置 (本番想定 / Spreadsheet 統合後)

```
[ Browser ]
    | HTTPS
    v
[ Vercel Edge Network ]  -- BotID (login pages)
    |
    v (Fluid Compute, Node.js 24)
+-------------------------------------------+
| Next.js App Router                        |
|  - Server Components                      |
|  - Server Actions                         |
|  - Route Handlers (/api/progress, cron)   |
+-------------------------------------------+
   |          |              |             \
   v          v              v              v
[ Clerk ] [ Neon PG ]   [ Vercel Blob ]   [ GAS Web App ] <--+
          via Prisma     private + signed   HMAC-SHA256       |
          (User, Enroll, URL                + X-Timestamp     |
           Progress,                        action: list_*    |
           Submission,                                 send_mail
           Answer,                                            |
           AuditLog,                                          v
           MailDelivery)                              [ Google Spreadsheet ]
                                                     [ MailApp.sendEmail ]
```

ポイント:
- LMS は **Sheets API を直接叩かない**。必ず GAS Web App を経由する。
- メール送信も Phase 4 までは GAS の `MailApp.sendEmail` (Workspace 1500/day) を使う。Resend への移行は将来検討。
- `MailDelivery` テーブルで送信成否を LMS 側で追跡 (fire-and-forget の補助)。

### 8.2 ports & adapters の追加

ADR 0001 の ports & adapters 設計を以下のように拡張する:

```
src/server/
├── ports/
│   ├── auth.ts          (既存)
│   ├── mail.ts          (既存)
│   ├── storage.ts       (既存)
│   ├── logger.ts        (既存)
│   └── cms.ts           (NEW) — Course/Lesson/Test/Question/Choice 読取
├── adapters/
│   ├── stub/
│   │   ├── auth.ts
│   │   ├── mail.ts            (console.log)
│   │   ├── storage.ts
│   │   └── cms.ts             (NEW) — SQLite 直読 (移行期の暫定)
│   ├── prod/
│   │   ├── clerk-auth.ts
│   │   ├── resend-mail.ts     (Phase 4 以降)
│   │   └── blob-storage.ts
│   └── spreadsheet/           (NEW)
│       ├── client.ts          — fetch + HMAC 署名生成
│       ├── cms.ts             — listCourses / listLessons / ...
│       └── mail.ts            — MailPort の GAS 実装
```

`src/server/container.ts` の解決ロジック:

| `process.env.CMS_SOURCE` | `container.cms` |
| --- | --- |
| `"sqlite"` (default) | `stubCms` (SQLite 直読、移行期 Phase A〜C 用) |
| `"spreadsheet"` | `spreadsheetCms` (GAS Web App 経由) |

| `process.env.MAIL_DRIVER` | `container.mail` |
| --- | --- |
| `"console"` (default) | `stubMail` |
| `"gas"` | `spreadsheetMail` |
| `"resend"` (Phase 4 以降) | `resendMail` |

`CMS_SOURCE` を **エンティティ単位で切替可能** にする (Phase D の段階移行用):

```
CMS_SOURCE_COURSE=spreadsheet
CMS_SOURCE_LESSON=sqlite
CMS_SOURCE_TEST=sqlite
...
```

未指定 entity は `CMS_SOURCE` (グローバル) にフォールバック。

### 8.3 CMS Port (`src/server/ports/cms.ts`)

```ts
// Spreadsheet 側エンティティの DTO 型 (Prisma model から切り離す)
export type CourseDto = {
  id: string;
  title: string;
  description: string;
  order: number;
  published: boolean;
  createdAt: string; // ISO8601
  updatedAt: string;
};

export type LessonDto = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  videoUrl: string;
  durationSec: number;
  order: number;
  blockSeek: boolean;
  requiredCompletionRate: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TestDto = {
  id: string;
  courseId: string;
  title: string;
  passingScore: number;
  maxAttempts: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type QuestionDto = {
  id: string;
  testId: string;
  order: number;
  type: "SINGLE" | "MULTIPLE";
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type ChoiceDto = {
  id: string;
  questionId: string;
  order: number;
  text: string;
  isCorrect: boolean;
  createdAt: string;
  updatedAt: string;
};

export interface CmsPort {
  listCourses(): Promise<CourseDto[]>;
  listLessons(filter?: { courseId?: string }): Promise<LessonDto[]>;
  listTests(filter?: { courseId?: string }): Promise<TestDto[]>;
  listQuestions(filter?: { testId?: string }): Promise<QuestionDto[]>;
  listChoices(filter?: { questionId?: string }): Promise<ChoiceDto[]>;
}
```

### 8.4 Spreadsheet シーマ (5 シート)

ADMIN は Spreadsheet 上で **直接編集** する。各シートの 1 行目はヘッダ行 (列名)、2 行目以降がデータ。
ヘッダ名は **英字 ID + 日本語併記** とし、ADMIN が一目で意味を理解できるようにする。実装側 (GAS / LMS) は **半角英字部分のみ** を見て列を解決する (例: `id (主キー)` のうち `id`)。

#### Course シート

| 列 (ヘッダ) | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id (主キー)` | string (cuid) | ○ | 主キー。`setupSheets` で重複禁止のデータ検証を入れる |
| `title (コース名)` | string | ○ | コース名 |
| `description (説明)` | string | × | 空欄可 |
| `order (表示順)` | number | ○ | 0 以上の整数 |
| `published (公開)` | boolean (TRUE/FALSE) | ○ | プルダウン (データ検証) |
| `createdAt (作成日時)` | ISO8601 | ○ | 行追加時に GAS が自動付与 (新規入力時 `=NOW()` でも可) |
| `updatedAt (更新日時)` | ISO8601 | ○ | 編集時に GAS の `onEdit` トリガで更新 (任意。手動でも可) |

#### Lesson シート

| 列 (ヘッダ) | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id (主キー)` | string (cuid) | ○ | 主キー |
| `courseId (所属コースID)` | string | ○ | Course.id を参照。`setupSheets` で「Course シートの id 列」を参照するデータ検証 |
| `title (レッスン名)` | string | ○ | |
| `description (説明)` | string | × | |
| `videoUrl (動画URL)` | string | ○ | mock 期は `/sample.mp4`、本番は Vercel Blob 署名前 URL or YouTube |
| `durationSec (動画長秒)` | number | ○ | 完了率計算に使う |
| `order (表示順)` | number | ○ | |
| `blockSeek (早送り抑止)` | boolean | ○ | プルダウン |
| `requiredCompletionRate (完了率)` | number | × | 空欄なら 0.95。0.0〜1.0 |
| `createdAt (作成日時)` | ISO8601 | ○ | |
| `updatedAt (更新日時)` | ISO8601 | ○ | |

#### Test シート

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id (主キー)` | string | ○ | |
| `courseId (対象コースID)` | string | ○ | Course.id 参照 |
| `title (テスト名)` | string | ○ | |
| `passingScore (合格点)` | number | ○ | 0〜100 |
| `maxAttempts (最大受験回数)` | number | ○ | 1 以上 |
| `published (公開)` | boolean | ○ | |
| `createdAt` | ISO8601 | ○ | |
| `updatedAt` | ISO8601 | ○ | |

#### Question シート

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id (主キー)` | string | ○ | |
| `testId (所属テストID)` | string | ○ | Test.id 参照 |
| `order (表示順)` | number | ○ | |
| `type (出題形式)` | enum | ○ | `SINGLE` または `MULTIPLE` (プルダウン) |
| `text (設問文)` | string | ○ | 改行可 |
| `createdAt` | ISO8601 | ○ | |
| `updatedAt` | ISO8601 | ○ | |

#### Choice シート

| 列 | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id (主キー)` | string | ○ | |
| `questionId (所属設問ID)` | string | ○ | Question.id 参照 |
| `order (表示順)` | number | ○ | |
| `text (選択肢文)` | string | ○ | |
| `isCorrect (正解)` | boolean | ○ | プルダウン |
| `createdAt` | ISO8601 | ○ | |
| `updatedAt` | ISO8601 | ○ | |

### 8.5 GAS Web App プロトコル (詳細は ADR 0005)

- 単一エンドポイント: `POST <GAS Web App URL>`
- 必須ヘッダ: `X-Timestamp`, `X-Signature`
- 署名対象: `${X-Timestamp}.${raw body string}`
- 5 分以上ずれた `X-Timestamp` は拒否
- ボディ: `{ "action": "...", ...params }`
- 共通レスポンス: `{ ok: true, data } | { ok: false, error: { code, message } }`

action 一覧:

| action | params | data |
| --- | --- | --- |
| `list_courses` | `{}` | `CourseDto[]` |
| `list_lessons` | `{ courseId? }` | `LessonDto[]` |
| `list_tests` | `{ courseId? }` | `TestDto[]` |
| `list_questions` | `{ testId? }` | `QuestionDto[]` |
| `list_choices` | `{ questionId? }` | `ChoiceDto[]` |
| `send_mail` | `{ to, subject, body, idempotencyKey }` | `{ accepted: true }` |

### 8.6 GAS .gs コード雛形 (完成形 / コピペ可)

> ScriptProperties に **`GAS_SECRET`** (= 強いランダム文字列) を **必ず** 事前設定する。未設定だとすべてのリクエストが弾かれる。
> シート名は固定: `Course`, `Lesson`, `Test`, `Question`, `Choice`。
> 1 行目をヘッダ行、半角英字部分 (例: `id`, `courseId`) で列を解決する。

```javascript
// =====================================================================
// LMS Spreadsheet Relay - GAS Web App
// 配置先: Apps Script project (Spreadsheet と紐付け済み)
// 必要な ScriptProperties:
//   GAS_SECRET ... HMAC 共有秘密 (LMS の env と同じ値)
// =====================================================================

const SHEET_NAMES = ["Course", "Lesson", "Test", "Question", "Choice"];
const HEADERS = {
  Course:   ["id", "title", "description", "order", "published", "createdAt", "updatedAt"],
  Lesson:   ["id", "courseId", "title", "description", "videoUrl", "durationSec", "order", "blockSeek", "requiredCompletionRate", "createdAt", "updatedAt"],
  Test:     ["id", "courseId", "title", "passingScore", "maxAttempts", "published", "createdAt", "updatedAt"],
  Question: ["id", "testId", "order", "type", "text", "createdAt", "updatedAt"],
  Choice:   ["id", "questionId", "order", "text", "isCorrect", "createdAt", "updatedAt"],
};
const HEADER_LABELS_JA = {
  Course:   ["id (主キー)", "title (コース名)", "description (説明)", "order (表示順)", "published (公開)", "createdAt (作成日時)", "updatedAt (更新日時)"],
  Lesson:   ["id (主キー)", "courseId (所属コースID)", "title (レッスン名)", "description (説明)", "videoUrl (動画URL)", "durationSec (動画長秒)", "order (表示順)", "blockSeek (早送り抑止)", "requiredCompletionRate (完了率)", "createdAt (作成日時)", "updatedAt (更新日時)"],
  Test:     ["id (主キー)", "courseId (対象コースID)", "title (テスト名)", "passingScore (合格点)", "maxAttempts (最大受験回数)", "published (公開)", "createdAt (作成日時)", "updatedAt (更新日時)"],
  Question: ["id (主キー)", "testId (所属テストID)", "order (表示順)", "type (出題形式)", "text (設問文)", "createdAt (作成日時)", "updatedAt (更新日時)"],
  Choice:   ["id (主キー)", "questionId (所属設問ID)", "order (表示順)", "text (選択肢文)", "isCorrect (正解)", "createdAt (作成日時)", "updatedAt (更新日時)"],
};
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 分

// ---------------------- doPost (entry point) ----------------------
function doPost(e) {
  try {
    // 1. Body を取得 (raw のまま署名検証する)
    const raw = (e && e.postData && e.postData.contents) || "";
    const ts  = headerOf_(e, "X-Timestamp");
    const sig = headerOf_(e, "X-Signature");

    // 2. 署名検証
    const verify = verifySignature_(ts, raw, sig);
    if (!verify.ok) return jsonOut_({ ok: false, error: verify.error });

    // 3. JSON パース
    let body;
    try { body = JSON.parse(raw); }
    catch (_) { return jsonOut_({ ok: false, error: { code: "BAD_REQUEST", message: "invalid JSON body" } }); }

    const action = body.action;
    const params = Object.assign({}, body); delete params.action;

    // 4. action ディスパッチ
    switch (action) {
      case "list_courses":   return jsonOut_(handleList_("Course"));
      case "list_lessons":   return jsonOut_(handleList_("Lesson",   filterBy_(params, "courseId")));
      case "list_tests":     return jsonOut_(handleList_("Test",     filterBy_(params, "courseId")));
      case "list_questions": return jsonOut_(handleList_("Question", filterBy_(params, "testId")));
      case "list_choices":   return jsonOut_(handleList_("Choice",   filterBy_(params, "questionId")));
      case "send_mail":      return jsonOut_(handleSendMail_(params));
      default:
        return jsonOut_({ ok: false, error: { code: "BAD_REQUEST", message: "unknown action: " + String(action) } });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: { code: "INTERNAL", message: String(err && err.message || err) } });
  }
}

// ---------------------- list handler ----------------------
function handleList_(sheetName, filter) {
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) return { ok: false, error: { code: "INTERNAL", message: "sheet not found: " + sheetName } };
  const range = sh.getDataRange().getValues();
  if (range.length < 2) return { ok: true, data: [] };

  const headerRow = range[0].map(extractHeaderId_);
  const expected = HEADERS[sheetName];
  // 列の存在確認 (足りない列があれば INTERNAL)
  for (const h of expected) {
    if (headerRow.indexOf(h) < 0) {
      return { ok: false, error: { code: "INTERNAL", message: "missing column: " + h + " in " + sheetName } };
    }
  }

  const rows = [];
  for (let i = 1; i < range.length; i++) {
    const row = range[i];
    if (isEmptyRow_(row)) continue;
    const obj = {};
    expected.forEach((col) => {
      obj[col] = coerceValue_(sheetName, col, row[headerRow.indexOf(col)]);
    });
    if (filter && !matchFilter_(obj, filter)) continue;
    rows.push(obj);
  }
  return { ok: true, data: rows };
}

// ---------------------- send_mail handler ----------------------
function handleSendMail_(params) {
  const to             = String(params.to || "").trim();
  const subject        = String(params.subject || "").trim();
  const body           = String(params.body || "");
  const idempotencyKey = String(params.idempotencyKey || "").trim();

  if (!to || !subject || !idempotencyKey) {
    return { ok: false, error: { code: "BAD_REQUEST", message: "to / subject / idempotencyKey are required" } };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = "mail:" + idempotencyKey;
  if (cache.get(cacheKey)) {
    // 既に送信済 → 黙って ok
    return { ok: true, data: { accepted: true, deduped: true } };
  }

  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body });
    cache.put(cacheKey, "1", 60 * 60 * 24); // 24h 重複防止
    return { ok: true, data: { accepted: true } };
  } catch (e) {
    return { ok: false, error: { code: "MAIL_FAILED", message: String(e && e.message || e) } };
  }
}

// ---------------------- HMAC verification ----------------------
function verifySignature_(ts, raw, sig) {
  const secret = PropertiesService.getScriptProperties().getProperty("GAS_SECRET");
  if (!secret) return { ok: false, error: { code: "INTERNAL", message: "GAS_SECRET is not set" } };
  if (!ts || !sig) return { ok: false, error: { code: "INVALID_SIGNATURE", message: "missing X-Timestamp or X-Signature" } };

  const tsNum = Number(ts);
  if (!isFinite(tsNum)) return { ok: false, error: { code: "INVALID_SIGNATURE", message: "invalid X-Timestamp" } };
  if (Math.abs(Date.now() - tsNum) > TIMESTAMP_TOLERANCE_MS) {
    return { ok: false, error: { code: "EXPIRED_TIMESTAMP", message: "X-Timestamp out of tolerance" } };
  }

  const msg = ts + "." + raw;
  const macBytes = Utilities.computeHmacSha256Signature(msg, secret);
  const expectedHex = macBytes.map((b) => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? "0" + v : v;
  }).join("");

  if (!constantTimeEqual_(expectedHex, String(sig).toLowerCase())) {
    return { ok: false, error: { code: "INVALID_SIGNATURE", message: "signature mismatch" } };
  }
  return { ok: true };
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------- 型変換 / フィルタ / utility ----------------------
function coerceValue_(sheetName, col, v) {
  // boolean 列
  const booleanCols = {
    Lesson:   ["blockSeek"],
    Course:   ["published"],
    Test:     ["published"],
    Choice:   ["isCorrect"],
  };
  // number 列
  const numberCols = {
    Course:   ["order"],
    Lesson:   ["durationSec", "order", "requiredCompletionRate"],
    Test:     ["passingScore", "maxAttempts"],
    Question: ["order"],
    Choice:   ["order"],
  };
  // datetime 列 (ISO8601 文字列に正規化)
  const dateCols = ["createdAt", "updatedAt"];

  if (v === "" || v === null || v === undefined) {
    if ((numberCols[sheetName] || []).indexOf(col) >= 0) return null;
    if ((booleanCols[sheetName] || []).indexOf(col) >= 0) return false;
    if (dateCols.indexOf(col) >= 0) return null;
    return "";
  }
  if ((booleanCols[sheetName] || []).indexOf(col) >= 0) {
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toUpperCase();
    return s === "TRUE" || s === "1" || s === "YES";
  }
  if ((numberCols[sheetName] || []).indexOf(col) >= 0) {
    const n = Number(v);
    return isFinite(n) ? n : null;
  }
  if (dateCols.indexOf(col) >= 0) {
    if (Object.prototype.toString.call(v) === "[object Date]") return v.toISOString();
    return String(v);
  }
  return String(v);
}

function filterBy_(params, key) {
  const v = params && params[key];
  if (v === undefined || v === null || v === "") return null;
  const f = {}; f[key] = String(v);
  return f;
}
function matchFilter_(obj, filter) {
  for (const k in filter) if (String(obj[k]) !== String(filter[k])) return false;
  return true;
}
function isEmptyRow_(row) {
  for (let i = 0; i < row.length; i++) if (row[i] !== "" && row[i] !== null) return false;
  return true;
}
function extractHeaderId_(label) {
  // "id (主キー)" → "id" / "courseId (所属コースID)" → "courseId"
  return String(label).split(/\s|\(/)[0].trim();
}
function headerOf_(e, name) {
  // GAS Web App は e.parameter に来ないため、Apps Script の 2024+ 仕様で headers を取得
  // doPost の e オブジェクトの headers は (Apps Script V8) に正式 API なし。
  // 代替: postData.contents に乗せる方式もあるが、ここでは parameter フォールバックを許容。
  if (e && e.parameter && e.parameter[name]) return e.parameter[name];
  if (e && e.parameter && e.parameter[name.toLowerCase()]) return e.parameter[name.toLowerCase()];
  // 注: GAS は任意ヘッダ受信に制限がある。署名要素を query string にも載せて二重に渡す運用を推奨。
  // LMS adapter は X-Timestamp / X-Signature を **ヘッダ + クエリ ?ts=..&sig=..** の両方に付ける。
  return null;
}
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------- setupSheets (初回 1 回だけ実行) ----------------------
function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  for (const name of SHEET_NAMES) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    sh.getRange(1, 1, 1, HEADER_LABELS_JA[name].length).setValues([HEADER_LABELS_JA[name]]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADER_LABELS_JA[name].length).setFontWeight("bold").setBackground("#f0f0f0");
  }
  // GAS_SECRET の存在確認
  const secret = PropertiesService.getScriptProperties().getProperty("GAS_SECRET");
  if (!secret) {
    SpreadsheetApp.getUi().alert("注意: ScriptProperties に GAS_SECRET が未設定です。Apps Script エディタの「プロジェクトの設定」→「スクリプト プロパティ」で追加してください。");
  } else {
    SpreadsheetApp.getUi().alert("setupSheets 完了。シート 5 種を初期化しました。");
  }
}
```

> 注意: GAS Web App の HTTP ヘッダ受信は仕様変更の影響を受けやすい。**LMS adapter 側は署名要素 (`X-Timestamp` / `X-Signature`) を「カスタムヘッダ」と「クエリパラメータ `ts` / `sig`」の両方** に付ける実装にする。GAS 側は `e.parameter` を読むフォールバックで両対応する (`headerOf_` 参照)。

### 8.7 in-memory キャッシュ (LMS 側)

`src/server/adapters/spreadsheet/cms.ts` 内で 5 分 TTL のキャッシュを持つ:

```ts
const TTL_MS = 5 * 60 * 1000;
type CacheEntry<T> = { at: number; data: T };
const cache = new Map<string, CacheEntry<unknown>>();

async function withCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = await loader();
  cache.set(key, { at: Date.now(), data });
  return data;
}
```

- key 例: `"courses"`, `"lessons:" + courseId`
- ADMIN が Spreadsheet を編集してから最大 5 分で LMS に反映。「即時反映が必要」な場合は `?nocache=1` クエリで bypass を許す API を将来追加。

### 8.8 移行 (Phase A〜E)

詳細は ADR 0003 / 0004 を参照しつつ、運用上は以下:

| Phase | 範囲 | LMS 設定 | ロールバック |
| --- | --- | --- | --- |
| A | GAS 配置 + 疎通テスト (curl) | コード変更なし | 不要 (LMS 未接続) |
| B | ADMIN が SQLite データを Spreadsheet に手作業移植 | コード変更なし | Spreadsheet 削除 |
| C | Course だけ Spreadsheet 読取に切替 | `CMS_SOURCE_COURSE=spreadsheet` | env を `sqlite` に戻す |
| D | Lesson / Test / Question / Choice を順次切替 | 各 entity の env を 1 つずつ切替 | env を `sqlite` に戻す |
| E | Prisma から Course / Lesson / Test / Question / Choice モデル削除 + DROP TABLE | `CMS_SOURCE=spreadsheet` 固定 | (要 backup → restore) |

各 Phase 完了の判定は **ADMIN ダッシュボードでコース一覧が正しく表示されること + 任意のレッスン視聴ページが開くこと** を最低基準とする。

---

## 9. データフロー再整理 (Spreadsheet 統合後)

### 9.1 受講者がコース一覧を開く
1. `/dashboard` (Server Component) で `requireUser()`
2. `container.cms.listCourses()` → spreadsheet adapter → 5 分キャッシュ → (必要なら) GAS Web App へ POST
3. 並行して `prisma.enrollment.findMany({ where: { userId } })` で割当を取得
4. LMS 側で **メモリ join** (`enrollments.map(e => courses.find(c => c.id === e.courseId))`)
5. HTML を返す

### 9.2 動画進捗保存
ADR 0004 の通り、Progress は Postgres へ。CMS は noop。
ただし `progressService.upsert` 内で `lessonId` の存在を `cms.listLessons({ courseId })` でバリデーション (キャッシュヒットなので追加 RTT ほぼゼロ)。

### 9.3 メール送信 (招待)
1. ADMIN が `createUserAction` 実行
2. `prisma.user.create` 成功
3. `prisma.mailDelivery.create({ idempotencyKey: "invite:" + userId, status: "PENDING" })`
4. `container.mail.send({ to, subject, body, idempotencyKey })` → spreadsheet mail adapter → GAS Web App `send_mail`
5. 結果に応じて `mailDelivery.status` を `SENT` / `FAILED` に更新

---

## 10. Prisma スキーマ縮小計画 (ADR 0004 の詳細)

> 実際のマイグレーションは Phase E で `backend` が実施する。ここでは設計のみ。

### 10.1 削除するモデル (5 つ)

```prisma
// 削除
model Course { ... }
model Lesson { ... }
model Test { ... }
model Question { ... }
model Choice { ... }
// 削除する Enum
enum QuestionType { SINGLE MULTIPLE }
```

### 10.2 縮小するモデル (4 つ)

```prisma
model Enrollment {
  id          String    @id @default(cuid())
  userId      String
  courseId    String    // ← Course relation 削除、string FK のみ
  assignedAt  DateTime  @default(now())
  dueAt       DateTime?
  completedAt DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, courseId])
  @@index([userId, completedAt])
  @@index([courseId, completedAt])
  @@index([dueAt])
}

model Progress {
  id              String    @id @default(cuid())
  userId          String
  lessonId        String    // ← Lesson relation 削除
  watchedSec      Int       @default(0)
  lastPositionSec Int       @default(0)
  completed       Boolean   @default(false)
  completedAt     DateTime?
  updatedAt       DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, lessonId])
  @@index([userId, completed])
  @@index([lessonId])
}

model Submission {
  id          String           @id @default(cuid())
  testId      String           // ← Test relation 削除
  userId      String
  status      SubmissionStatus @default(IN_PROGRESS)
  score       Int?
  attemptNo   Int              @default(1)
  startedAt   DateTime         @default(now())
  submittedAt DateTime?

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  answers Answer[]

  @@index([testId, userId])
  @@index([userId, status])
}

model Answer {
  id           String @id @default(cuid())
  submissionId String
  questionId   String           // ← Question relation 削除
  choiceId     String           // ← Choice relation 削除

  submission Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)

  @@unique([submissionId, questionId, choiceId])
  @@index([submissionId])
  @@index([questionId])
}
```

### 10.3 新設モデル

```prisma
model MailDelivery {
  id             String     @id @default(cuid())
  idempotencyKey String     @unique
  to             String
  subject        String
  template       String     // "INVITE" | "ASSIGN" | "REMINDER"
  status         MailStatus @default(PENDING)
  attemptCount   Int        @default(0)
  lastError      String?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  sentAt         DateTime?

  @@index([status, createdAt])
}

enum MailStatus { PENDING SENT FAILED }
```

### 10.4 マイグレーション SQL 案 (Phase E、Postgres 想定)

```sql
-- 1. 既存データの sanity check (削除前に参照孤児がないか確認)
SELECT COUNT(*) FROM "Enrollment" e LEFT JOIN "Course" c ON c.id = e."courseId" WHERE c.id IS NULL;
-- 0 でなければ手動修正

-- 2. relation を Drop (外部キーのみ削除、カラムは残す)
ALTER TABLE "Enrollment" DROP CONSTRAINT IF EXISTS "Enrollment_courseId_fkey";
ALTER TABLE "Progress"   DROP CONSTRAINT IF EXISTS "Progress_lessonId_fkey";
ALTER TABLE "Submission" DROP CONSTRAINT IF EXISTS "Submission_testId_fkey";
ALTER TABLE "Answer"     DROP CONSTRAINT IF EXISTS "Answer_questionId_fkey";
ALTER TABLE "Answer"     DROP CONSTRAINT IF EXISTS "Answer_choiceId_fkey";

-- 3. テーブル削除
DROP TABLE IF EXISTS "Choice";
DROP TABLE IF EXISTS "Question";
DROP TABLE IF EXISTS "Test";
DROP TABLE IF EXISTS "Lesson";
DROP TABLE IF EXISTS "Course";

-- 4. Enum 削除
DROP TYPE IF EXISTS "QuestionType";

-- 5. MailDelivery / MailStatus 追加 (Prisma migrate が自動生成)
```

ロールバック: SQL を逆順に実行する代わりに、Phase E 直前の `pg_dump` を取得して restore。

---

## 11. Notion を唯一の DB として採用 — ADR 0006 (現行)

> 2026-05-02 改定。ADR 0003〜0005 (Spreadsheet=CMS / RDB=書込系 構成) は **ADR 0006 によって完全に置き換えられた**。
> 本節が現行の構成。§8〜§10 は歴史的記録として残す。

### 11.1 ランタイム配置

```
[ Browser ]
    | HTTPS
    v
[ Vercel Edge Network ]  -- BotID (login pages)
    |
    v (Fluid Compute, Node.js 24)
+-------------------------------------------+
| Next.js App Router                        |
|  - Server Components (一覧/集計の描画)     |
|  - Server Actions  (フォーム送信)          |
|  - Route Handlers  (/api/progress, cron)  |
|  - In-memory cache + write queue          |
|  - Token bucket rate limiter (3 req/s)    |
+-------------------------------------------+
   |              |                   |
   v              v                   v
[ Clerk ]   [ Notion API ]      [ Vercel Blob ] (動画)
            (11 DB,
             @notionhq/client)
                                [ GAS Mail Relay ] (送信のみ。Phase 4 で Resend 候補)
```

ポイント:
- **Prisma / Neon / Spreadsheet は不要**。Notion API のみが LMS のデータソース
- 11 個の Notion DB を Integration が読み書きする
- Vercel Function 内 in-memory で **write queue** + **read cache** を持つ
- メール送信のみ GAS リレーを継続 (Notion で送信不可のため)

### 11.2 ports & adapters の更新

```
src/server/
├── ports/
│   ├── auth.ts        (既存)
│   ├── mail.ts        (既存)
│   ├── storage.ts     (既存)
│   ├── logger.ts      (既存)
│   ├── cms.ts         (既存 → Notion adapter で実装)
│   ├── repositories.ts (NEW) — User/Enrollment/Progress/Submission/Answer/AuditLog の port
│   └── audit.ts       (NEW or 既存) — AuditLog 専用 (hash chain)
├── adapters/
│   ├── stub/          (既存。dev/test 用 in-memory)
│   └── notion/        (NEW、本番)
│       ├── client.ts        — @notionhq/client 初期化 + rate limiter
│       ├── rate-limiter.ts  — 3 req/s token bucket
│       ├── cache.ts         — TTL 別 in-memory cache (5min / 30s / none)
│       ├── write-queue.ts   — Progress 用 30 秒バッファ
│       ├── cms.ts           — Course/Lesson/Test/Question/Choice
│       ├── user.ts          — User CRUD + email lookup
│       ├── enrollment.ts
│       ├── progress.ts      — write は queue 経由
│       ├── submission.ts    — Submission + Answer (best-effort tx)
│       ├── audit-log.ts     — hash chain 計算 + write
│       └── property-mapper.ts — Notion property ⇔ DTO の変換
```

`src/server/container.ts`:

| `process.env.DATA_DRIVER` | 解決先 |
| --- | --- |
| `"stub"` (dev/test) | in-memory stub adapter |
| `"notion"` (default for prod) | Notion adapter (全 11 DB) |

`MAIL_DRIVER`:
| 値 | 実装 |
| --- | --- |
| `console` (dev) | console.log |
| `gas` (現行本番候補) | GAS `send_mail` action (ADR 0005 の継続部分) |
| `resend` (Phase 4) | Resend SDK |

### 11.3 Notion DB スキーマ (11 個)

各 DB の **property 一覧 + Notion type**。すべての DB に **`id` (rich_text, cuid)** と **`createdAt` / `updatedAt` (date, ISO8601)** を持たせる。Notion page id は使わない。

#### CMS 系 (5 個)

##### `Course`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | cuid |
| `title` | title | ○ | Notion 必須の title プロパティを兼ねる |
| `description` | rich_text | × | |
| `order` | number | ○ | 0 以上 |
| `published` | checkbox | ○ | |
| `createdAt` | date | ○ | |
| `updatedAt` | date | ○ | |

##### `Lesson`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | |
| `title` | title | ○ | |
| `courseId` | rich_text | ○ | Course.id 参照 (relation 不使用) |
| `description` | rich_text | × | |
| `videoUrl` | url | ○ | Vercel Blob URL or YouTube |
| `durationSec` | number | ○ | |
| `order` | number | ○ | |
| `blockSeek` | checkbox | ○ | |
| `requiredCompletionRate` | number | × | 空 → 0.95 |
| `createdAt` | date | ○ | |
| `updatedAt` | date | ○ | |

##### `Test`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | |
| `title` | title | ○ | |
| `courseId` | rich_text | ○ | |
| `prerequisiteCourseId` | rich_text | × | 受講条件 |
| `passingScore` | number | ○ | 0〜100 |
| `maxAttempts` | number | ○ | 1 以上 |
| `published` | checkbox | ○ | |
| `createdAt` | date | ○ | |
| `updatedAt` | date | ○ | |

##### `Question`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | |
| `text` | title | ○ | 設問文を title に格納 |
| `testId` | rich_text | ○ | |
| `order` | number | ○ | |
| `type` | select | ○ | `SINGLE` / `MULTIPLE` |
| `explanation` | rich_text | × | |
| `createdAt` | date | ○ | |
| `updatedAt` | date | ○ | |

##### `Choice`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | |
| `text` | title | ○ | |
| `questionId` | rich_text | ○ | |
| `order` | number | ○ | |
| `isCorrect` | checkbox | ○ | |
| `createdAt` | date | ○ | |
| `updatedAt` | date | ○ | |

#### アプリ系 (6 個)

##### `User`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | cuid |
| `name` | title | ○ | |
| `email` | email | ○ | Notion の email type を使用。ユニーク制約は LMS 側で担保 |
| `role` | select | ○ | `STUDENT` / `ADMIN` |
| `passwordHash` | rich_text | × | mock 期のみ。本番 Clerk 切替後は空 |
| `clerkUserId` | rich_text | × | Phase 4 で Clerk 統合時 |
| `sessionVersion` | number | ○ | 既定 0 |
| `deactivated` | checkbox | ○ | |
| `createdAt` | date | ○ | |
| `updatedAt` | date | ○ | |

##### `Enrollment`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | |
| `name` | title | ○ | `${userId}:${courseId}` 等の自動生成 (Notion title 必須対応) |
| `userId` | rich_text | ○ | |
| `courseId` | rich_text | ○ | |
| `assignedAt` | date | ○ | |
| `dueAt` | date | × | |
| `completedAt` | date | × | |

`(userId, courseId)` のユニーク制約は LMS 側 lookup で担保。

##### `Progress`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | |
| `name` | title | ○ | `${userId}:${lessonId}` |
| `userId` | rich_text | ○ | |
| `lessonId` | rich_text | ○ | |
| `watchedSec` | number | ○ | |
| `lastPositionSec` | number | ○ | |
| `completed` | checkbox | ○ | |
| `completedAt` | date | × | |
| `updatedAt` | date | ○ | |

書込は **write queue 経由** で 30 秒バッファ。

##### `Submission`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | |
| `name` | title | ○ | `${userId}:${testId}:#${attemptNo}` |
| `userId` | rich_text | ○ | |
| `testId` | rich_text | ○ | |
| `status` | select | ○ | `IN_PROGRESS` / `PASSED` / `FAILED` / `ABANDONED` |
| `score` | number | × | 0〜100 |
| `attemptNo` | number | ○ | |
| `startedAt` | date | ○ | |
| `submittedAt` | date | × | |

##### `Answer`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | |
| `name` | title | ○ | `${submissionId}:${questionId}` |
| `submissionId` | rich_text | ○ | |
| `questionId` | rich_text | ○ | |
| `choiceId` | rich_text | × | 複数選択は `,` 区切りでも別レコード化でも可。設計は **複数行** に統一 (1 row = 1 choice) |
| `createdAt` | date | ○ | |

##### `AuditLog`
| property | type | 必須 | 備考 |
| --- | --- | --- | --- |
| `id` | rich_text | ○ | |
| `name` | title | ○ | `${action}:${target}` |
| `actorId` | rich_text | ○ | userId |
| `action` | rich_text | ○ | enum 文字列 (例: `USER_CREATE`) |
| `target` | rich_text | ○ | `${entity}:${id}` |
| `diff` | rich_text | × | JSON 文字列 (2000 字以内に切詰) |
| `prevHash` | rich_text | × | 直前 record の hash。最初は `genesis` |
| `hash` | rich_text | ○ | sha256(`prevHash` + `actorId` + `action` + `target` + `diff` + `at`) |
| `at` | date | ○ | |

### 11.4 性能緩和策の実装方針

#### (a) 書込スロットル (`rate-limiter.ts`)
- token bucket: 容量 5、補充 3/sec
- 全 Notion API 呼出 (read 含む) を `await limiter.acquire()` で gate
- 待ち超過 (>5s) 時は `RATE_LIMITED` を返す

#### (b) Progress 書込キュー (`write-queue.ts`)
- `Map<"${userId}:${lessonId}", PendingProgress>` を Function 内 in-memory に保持
- 受信時: Map に最新値を上書き
- 30 秒タイマー or サイズ閾値 (50 件) で flush → Notion へ batch update
- **失敗時は次回 flush でリトライ**。3 回連続失敗で `lastError` を AuditLog に記録
- ベストエフォート: Function 再起動でロスト → クライアント localStorage が補完

#### (c) 読込キャッシュ (`cache.ts`)
```ts
type Tier = "long" | "short" | "none";
const TTL: Record<Tier, number> = { long: 5*60_000, short: 30_000, none: 0 };
```
| エンティティ | tier |
| --- | --- |
| Course / Lesson / Test / Question / Choice | long |
| User / Enrollment | short |
| Progress / Submission / Answer / AuditLog | none |

key 例: `"course:list"`, `"lesson:list:courseId=xxx"`, `"user:byEmail:foo@bar"`

#### (d) AuditLog hash chain
```
1. lock = mutex.acquire("audit-log")  // Function 内 in-memory mutex
2. last = notion.query(AuditLog, sort=createdAt desc, limit=1)
3. prevHash = last?.hash ?? "genesis"
4. hash = sha256(prevHash + actorId + action + target + diff + at)
5. notion.create({ ..., prevHash, hash })
6. lock.release()
```

複数 Function インスタンス間の同時書込はベストエフォート (再計算を許容)。`scripts/verify-audit-chain.ts` を Notion 対応版に backend が書換予定。

### 11.5 個人 Notion → 会社 Notion 切替戦略

env 変更だけで切替えられる設計:

1. **会社 Notion ワークスペース** で Integration を作成 (個人と同じ権限)
2. 親ページを作成し、Integration を共有
3. **個人 Notion で使った 11 DB と同じ property** を会社 Notion に作る
   - 推奨: `scripts/notion-setup.ts` (将来作成) を会社 workspace で実行 → 11 DB 自動生成
   - 手動でも可 (property 名・type が一致していればよい)
4. 各 DB の ID を取得 (URL の `?v=...` 直前のハイフン区切り 32 桁)
5. Vercel env を **書き換える** (`NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID`, `NOTION_DB_*` 11 個)
6. 再デプロイ → 会社 Notion 接続完了

**データ移行 (任意)**:
- `scripts/notion-export.ts` (将来): 個人 Notion から全レコードを JSONL に export
- `scripts/notion-import.ts` (将来): JSONL を会社 Notion に import
- 移行不要なら個人テストデータは破棄、会社で seed から作り直し

### 11.6 既存 Spreadsheet/GAS の扱い

| 機能 | 扱い | Phase |
| --- | --- | --- |
| Spreadsheet (CMS) | **段階的廃止**。Phase G2 で adapter 削除、Phase G4 後に Spreadsheet 自体を削除可能 | G2〜G4 |
| `gas/seed-data/*.tsv` | **保持**。Notion 投入用 seed の元データとして使う | 継続 |
| GAS `list_*` action | **削除**。Notion adapter で代替 | G2 |
| GAS `send_mail` action | **継続採用** (Notion でメール送信不可のため) | 継続。Phase 4 で Resend 切替を検討 |
| Prisma / SQLite / Neon | **削除**。`prisma/` ディレクトリ + `DATABASE_URL` env を撤廃 | G2 |

メール送信を **GAS のまま続けるか Resend にするか** の判断:
- 現実解: **GAS Mail Relay を Phase G では維持** (動作確認済、ドメイン認証不要)
- Phase 4 で送信量増加・テンプレート要件があれば Resend に切替 (MailPort 差替えのみ)

### 11.7 Vercel デプロイ仕様 (Notion 化後)

| 設定 | 値 |
| --- | --- |
| `DATABASE_URL` | **不要** (削除) |
| Prisma generate | **不要** (Phase G2 で `prisma/` 撤廃) |
| `prisma migrate deploy` | **不要** |
| 必須 env | `NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID`, `NOTION_DB_*` × 11 |
| Optional env | `GAS_WEBAPP_URL`, `GAS_SECRET` (メール送信維持時), `MAIL_DRIVER`, `DATA_DRIVER=notion` |
| build command | `next build` のみ |
| Region | `hnd1` (東京、既存設定維持) |

### 11.8 移行プラン (Phase F〜G)

| Phase | 内容 | 担当 |
| --- | --- | --- |
| F | architect が ADR 0006 + 本節 + `notion-setup.md` を作成 | architect (本タスク) |
| G1 | ユーザーが個人 Notion で Integration 作成、親ページ作成、`scripts/notion-setup.ts` 実行で 11 DB 自動生成 | ユーザー (手順は `docs/notion-setup.md`) |
| G2 | backend が `src/server/adapters/notion/*` を実装 (rate-limiter, cache, write-queue, 11 DB の CRUD)。Spreadsheet/Prisma adapter を撤廃 | backend |
| G3 | qa が Notion adapter の動作確認 (ローカル個人 Notion 接続、E2E) | qa |
| G4 | devops が Vercel に env 設定 → preview デプロイ → 本番デプロイ | devops |
| G5 | 会社 Notion 整備後、env 11 個を差替えて再デプロイ (5 分作業) | devops |

各 Phase の完了基準:
- **G1**: Notion 上で 11 DB が見える + Integration が接続済
- **G2**: ローカルで `pnpm dev` 起動 → ログイン → コース閲覧 → 進捗が Notion に反映される
- **G3**: E2E グリーン
- **G4**: 個人 Notion 接続の本番 URL でテストユーザーが操作できる
- **G5**: 会社 Notion 接続後、同じテストユーザーで操作確認

### 11.9 「rate limit と妥協で耐えられない部分」の明示

| シナリオ | 可否 | 理由 |
| --- | --- | --- |
| 30 名同時動画視聴 + 10 秒間隔 progress | **可** | 30 秒バッファで実 write は 1/30s ≒ 0.03 req/s |
| 100 名同時動画視聴 | **不可** | バッファ後でも write が 3 req/s に近づきバースト超過。`rate-limiter` で詰まる |
| 50 名同時テスト受験 (Submission + Answer 30 件 = 31 write) | **可だが遅い** | 50 × 31 = 1550 write を 3 req/s で消化 ≒ 8 分。受験者には「採点中…」表示で待たせる |
| ADMIN 一括割当 100 名 × 5 コース = 500 行 | **可だが遅い** | 約 3 分。バックグラウンドジョブ化を検討 |
| ダッシュボード集計 (User/Enrollment/Progress を全件 join) | **可だが遅い** | 数千 record で 数秒。5 分キャッシュで吸収 |
| AuditLog に毎秒数十書込 | **不可** | Notion で受け切れない。AuditLog は重要操作に限定 |
