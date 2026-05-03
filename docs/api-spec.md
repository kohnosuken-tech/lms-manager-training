# API 仕様 (一覧)

> Server Action (SA) と Route Handler (RH) の一覧。各行 1 行記述。詳細スキーマは省略。
> レスポンス形式: `{ ok: true, data } | { ok: false, error: { code, message } }`

## 1. 認証 (受講者・ADMIN 共通)

| 種別 | パス / 関数 | 引数 | 戻り値 | 概要 |
| --- | --- | --- | --- | --- |
| SA | `signInAction` | `{ email, password }` | `{ userId }` | サインイン (cookie 設定) |
| SA | `signOutAction` | `()` | `void` | cookie 破棄 |
| RH | `GET /api/me` | — | `{ user }` | 現在のセッションユーザー取得 |

## 2. 受講者向け

| 種別 | パス / 関数 | 引数 | 戻り値 | 概要 |
| --- | --- | --- | --- | --- |
| SC | `/dashboard` (page) | — | HTML | 担当コース一覧 + 進捗 |
| SC | `/courses/[id]` | `{ id }` | HTML | コース詳細・Lesson 一覧 |
| SC | `/courses/[id]/lessons/[lessonId]` | `{ id, lessonId }` | HTML | 動画再生ページ |
| RH | `POST /api/progress` | `{ lessonId, watchedSec, lastPositionSec }` | `{ completed }` | 視聴進捗を 10 秒間隔で保存 |
| SA | `startTestAction` | `{ testId }` | `{ submissionId }` | テスト受験開始 (Submission 作成) |
| SA | `submitTestAction` | `{ submissionId, answers: [{ questionId, choiceIds }] }` | `{ score, status }` | テスト提出・自動採点 |
| SC | `/tests/[id]` | `{ id }` | HTML | テスト受験画面 (シャッフル済み問題) |
| SC | `/submissions/[id]` | `{ id }` | HTML | 結果 + 解説表示 |

## 3. 管理者向け (ADMIN)

### 3.1 ユーザー管理

| 種別 | パス / 関数 | 引数 | 戻り値 | 概要 |
| --- | --- | --- | --- | --- |
| SC | `/admin/users` | — | HTML | ユーザー一覧 |
| SA | `createUserAction` | `{ email, name, role }` | `{ userId }` | ユーザー個別作成 + 招待メール |
| SA | `bulkCreateUsersAction` | `{ csv: string }` | `{ created, errors }` | CSV 一括作成 |
| SA | `deactivateUserAction` | `{ userId }` | `void` | 無効化 (論理削除) |
| SA | `changeRoleAction` | `{ userId, role }` | `void` | ロール変更 |

### 3.2 コース / レッスン管理

| 種別 | パス / 関数 | 引数 | 戻り値 | 概要 |
| --- | --- | --- | --- | --- |
| SC | `/admin/courses` | — | HTML | コース一覧 |
| SA | `createCourseAction` | `{ title, description, order }` | `{ courseId }` | コース作成 |
| SA | `updateCourseAction` | `{ id, ...patch }` | `void` | コース更新 |
| SA | `publishCourseAction` | `{ id, published }` | `void` | 公開切替 |
| SA | `createLessonAction` | `{ courseId, title, videoUrl, durationSec, order, blockSeek, requiredCompletionRate? }` | `{ lessonId }` | レッスン作成 |
| SA | `updateLessonAction` | `{ id, ...patch }` | `void` | レッスン更新 |
| SA | `deleteLessonAction` | `{ id }` | `void` | レッスン削除 |
| RH | `POST /api/admin/upload-url` | `{ filename, contentType, sizeBytes }` | `{ uploadUrl, blobUrl }` | (Phase4) Vercel Blob 署名 URL 発行。モックは `/sample.mp4` 固定を返す |

### 3.3 受講割当 (Enrollment)

| 種別 | パス / 関数 | 引数 | 戻り値 | 概要 |
| --- | --- | --- | --- | --- |
| SA | `assignCourseAction` | `{ userIds, courseId, dueAt? }` | `{ assigned }` | コース割当 + 課題割当メール |
| SA | `unassignCourseAction` | `{ userId, courseId }` | `void` | 割当解除 |

### 3.4 テスト管理

| 種別 | パス / 関数 | 引数 | 戻り値 | 概要 |
| --- | --- | --- | --- | --- |
| SC | `/admin/tests` | — | HTML | テスト一覧 |
| SA | `createTestAction` | `{ courseId, title, prerequisiteCourseId?, passingScore, maxAttempts, timeLimitSec? }` | `{ testId }` | テスト作成 |
| SA | `updateTestAction` | `{ id, ...patch }` | `void` | テスト更新 |
| SA | `publishTestAction` | `{ id, published }` | `void` | 公開切替 |
| SA | `addQuestionAction` | `{ testId, type, prompt, explanation, choices: [{ label, correct }] }` | `{ questionId }` | 設問追加 |
| SA | `updateQuestionAction` | `{ id, ...patch }` | `void` | 設問更新 |
| SA | `deleteQuestionAction` | `{ id }` | `void` | 設問削除 |

### 3.5 ダッシュボード / レポート

| 種別 | パス / 関数 | 引数 | 戻り値 | 概要 |
| --- | --- | --- | --- | --- |
| SC | `/admin/dashboard` | — | HTML | 受講率・合格率・未完了者一覧 (Prisma 集計, リアルタイム) |
| RH | `GET /api/admin/export?type=users` | `?type` | `text/csv` | ユーザー CSV |
| RH | `GET /api/admin/export?type=courses` | — | `text/csv` | コース CSV |
| RH | `GET /api/admin/export?type=progress` | `?courseId?` | `text/csv` | 進捗 CSV |

### 3.6 監査ログ

| 種別 | パス / 関数 | 引数 | 戻り値 | 概要 |
| --- | --- | --- | --- | --- |
| SC | `/admin/audit` | `?cursor?&action?` | HTML | 監査ログ閲覧 (ページネーション) |

## 4. システム (cron / webhook)

| 種別 | パス | 引数 | 戻り値 | 概要 |
| --- | --- | --- | --- | --- |
| RH | `POST /api/cron/reminders` | header `Authorization: Bearer $CRON_SECRET` | `{ sent }` | 課題期限 7 日前リマインダ (未完了者のみ, 日次) |
| RH | `POST /api/webhooks/clerk` | Clerk webhook payload | `void` | (Phase4) Clerk → User 同期 |

## 5. 共通エラーコード

| code | 意味 |
| --- | --- |
| `UNAUTHENTICATED` | 未ログイン |
| `FORBIDDEN` | 権限不足 |
| `NOT_FOUND` | 対象なし |
| `VALIDATION_FAILED` | zod バリデーション失敗 |
| `CONFLICT` | 一意制約違反など |
| `RATE_LIMITED` | (将来) レート制限 |
| `SEEK_BLOCKED` | 早送り抑止違反 |
| `ATTEMPTS_EXCEEDED` | 再受験上限超過 |
| `PREREQUISITE_NOT_MET` | 受講条件未達 |
| `INTERNAL` | 想定外エラー |

---

## 6. GAS Web App API (LMS ⇔ GAS リレー) — ADR 0005

> 2026-05-02 追加。LMS の **外向き** API 仕様。GAS Web App URL に対して LMS が POST する。
> エンドユーザー (ブラウザ) は本 API を直接叩かない。

### 6.1 エンドポイント

- URL: `process.env.GAS_WEBAPP_URL` (例: `https://script.google.com/macros/s/AKfy.../exec`)
- メソッド: `POST` 固定 (GAS Web App は単一 entrypoint)
- Content-Type: `application/json`
- 認証: HMAC-SHA256 (詳細 §6.3)

### 6.2 共通レスポンス形式

```ts
type GasResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

HTTP ステータスは GAS Web App の制約上常に `200`。`ok` フィールドで分岐すること。

### 6.3 認証 (必須)

リクエストに以下を **2 系統** (ヘッダ + クエリ) で付与する。GAS 側の HTTP ヘッダ受信仕様の制限に対する保険。

| 名前 | 内容 | ヘッダ名 | クエリ名 |
| --- | --- | --- | --- |
| timestamp | `Date.now()` の文字列 | `X-Timestamp` | `ts` |
| signature | `hex(HMAC-SHA256(ts + "." + raw_body, GAS_SECRET))` (lowercase) | `X-Signature` | `sig` |

検証ルール (GAS 側):
- `Math.abs(now - ts) > 5 分` → `EXPIRED_TIMESTAMP`
- 署名不一致 → `INVALID_SIGNATURE`
- constant time compare で照合

### 6.4 action 一覧

| action | params | 戻り data | 備考 |
| --- | --- | --- | --- |
| `list_courses` | `{}` | `CourseDto[]` | 全件返却 |
| `list_lessons` | `{ courseId? }` | `LessonDto[]` | `courseId` 指定で絞り込み |
| `list_tests` | `{ courseId? }` | `TestDto[]` | |
| `list_questions` | `{ testId? }` | `QuestionDto[]` | |
| `list_choices` | `{ questionId? }` | `ChoiceDto[]` | |
| `send_mail` | `{ to: string; subject: string; body: string; idempotencyKey: string }` | `{ accepted: true; deduped?: boolean }` | `idempotencyKey` で 24h 重複抑止 |

DTO 型は `docs/architecture.md` §8.3 (CmsPort) 参照。

### 6.5 リクエスト例 (curl)

```bash
TS=$(node -e 'process.stdout.write(String(Date.now()))')
BODY='{"action":"list_courses"}'
SIG=$(node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha256', process.env.GAS_SECRET).update('${TS}.'+'${BODY}').digest('hex'))")

curl -sS -X POST "${GAS_WEBAPP_URL}?ts=${TS}&sig=${SIG}" \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: ${TS}" \
  -H "X-Signature: ${SIG}" \
  --data "${BODY}"
# → {"ok":true,"data":[{"id":"c1","title":"...","published":true,...}, ...]}
```

### 6.6 LMS 側エラーコード (adapter で発生)

| code | 意味 |
| --- | --- |
| `CMS_UNREACHABLE` | GAS Web App に到達不能 (DNS / network) |
| `CMS_INVALID_RESPONSE` | レスポンスが JSON でない / `ok` フィールドがない |
| `CMS_SCHEMA_MISMATCH` | DTO の zod 検証失敗 (列が足りない、型が違う等) |
| `CMS_REMOTE_ERROR` | GAS が `{ ok: false, error }` を返した。`error.code` を内包 |

### 6.7 GAS 側エラーコード (上に再掲)

| code | 意味 |
| --- | --- |
| `INVALID_SIGNATURE` | HMAC 不一致 |
| `EXPIRED_TIMESTAMP` | timestamp が 5 分以上ずれている |
| `BAD_REQUEST` | action 不明 / params 不足 / JSON parse 失敗 |
| `NOT_FOUND` | 指定 id がシートに存在しない (将来拡張) |
| `MAIL_FAILED` | `MailApp.sendEmail` が throw |
| `INTERNAL` | その他 (シート欠損、`GAS_SECRET` 未設定など) |

### 6.8 環境変数 (LMS 側)

| 名前 | 例 | 用途 |
| --- | --- | --- |
| `GAS_WEBAPP_URL` | `https://script.google.com/macros/s/.../exec` | リレー先 URL |
| `GAS_SECRET` | (32+ chars random) | HMAC 共有秘密 |
| `CMS_SOURCE` | `sqlite` \| `spreadsheet` | デフォルト CMS 解決先 |
| `CMS_SOURCE_COURSE` | (任意) | エンティティ単位の上書き |
| `CMS_SOURCE_LESSON` | (任意) | |
| `CMS_SOURCE_TEST` | (任意) | |
| `CMS_SOURCE_QUESTION` | (任意) | |
| `CMS_SOURCE_CHOICE` | (任意) | |
| `MAIL_DRIVER` | `console` \| `gas` \| `resend` | メール送信 driver |
| `SPREADSHEET_ID` | (Google Sheets の ID) | (参考: GAS が `SpreadsheetApp.getActive()` で解決するため LMS 側では未使用) |

