# Google Apps Script (GAS) Web App セットアップ手順

> 対象: プロジェクトオーナー (Spreadsheet と Apps Script project の所有者)
> 所要時間: 約 20〜30 分
> 必要なもの: Google Workspace アカウント、対象 Spreadsheet の編集権限、Apps Script project への編集権限、ターミナル (動作確認用 curl)

このドキュメント通りに進めれば、LMS から Google Spreadsheet にアクセスできる **GAS Web App** が動作する状態になります。途中で詰まったら **どのステップで止まったか** を Orchestrator (このプロジェクトの Claude セッション) に伝えてください。

---

## ステップ 0: 事前確認

以下の **2 つの URL** を手元に用意してください。`.env.local` には既にこれらの ID が入っているはずです。

- Spreadsheet URL: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`
- Apps Script project URL: `https://script.google.com/home/projects/<APPS_SCRIPT_PROJECT_ID>/edit`

両方とも **自分のアカウントでログインした状態** で開けることを確認してください。

> Apps Script の URL を紛失した場合: Spreadsheet を開き、メニュー「拡張機能」→「Apps Script」で同じ project を開けます (Spreadsheet と Container-Bound である必要があります)。

---

## ステップ 1: Apps Script に .gs コードを貼る

1. 上記 Apps Script project URL を開く。
2. 左サイドバーの「ファイル」一覧で、デフォルトの `コード.gs` (または `Code.gs`) を選択。
3. **エディタの中身を全削除** する (Ctrl+A → Delete)。
4. 本リポジトリの **`docs/architecture.md` §8.6** にある `// LMS Spreadsheet Relay - GAS Web App` 以下のコードを **そのまま全部コピペ** する。
5. 上部の **フロッピーディスクアイコン (保存)** をクリック、または `Ctrl+S` (Mac は `Cmd+S`)。「無題のプロジェクト」と表示されている場合は **プロジェクト名** を `LMS Spreadsheet Relay` に変更しておくと混乱しません。

---

## ステップ 2: ScriptProperties に `GAS_SECRET` を設定する

GAS Web App は HMAC 署名で守られています。**LMS と同じ秘密鍵** を GAS 側に登録します。

### 2-1. 強いランダム秘密鍵を生成

ターミナルで以下を実行:

```bash
openssl rand -hex 32
```

出力された 64 文字の hex 文字列 (例: `9f3a...d2b1`) を **コピーしてメモ帳などに保管**。後で `.env.local` にも書きます。

> openssl が無い場合: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` でも生成できます。

### 2-2. Apps Script の ScriptProperties に登録

1. Apps Script エディタの左サイドバーで、歯車アイコン (**プロジェクトの設定**) をクリック。
2. 下にスクロールして **「スクリプト プロパティ」** セクションを探す。
3. **「スクリプト プロパティを追加」** をクリック。
4. 入力欄:
   - **プロパティ**: `GAS_SECRET`
   - **値**: ステップ 2-1 でコピーした 64 文字の hex 文字列
5. **「スクリプト プロパティを保存」** をクリック。

> よくある間違い: **`GAS_SECRET` のスペル** (大文字 / 小文字) を間違えると、すべてのリクエストが `INTERNAL: GAS_SECRET is not set` で弾かれます。

---

## ステップ 3: 「ウェブアプリとしてデプロイ」する

1. Apps Script エディタ右上の **青色「デプロイ」ボタン** をクリック。
2. **「新しいデプロイ」** を選択。
3. ダイアログ左上の歯車アイコンをクリックし、**「ウェブアプリ」** を選択。
4. 設定:
   - **説明**: `LMS Relay v1` (任意の文字列で OK)
   - **次のユーザーとして実行**: **自分** (`<あなたのメール>`)
   - **アクセスできるユーザー**: **全員**
     - 注意: 「全員」とは **URL を知っている全員** という意味で、認証は HMAC 署名で行います。URL のみではアクセス不可です。
5. **「デプロイ」** をクリック。
6. 初回は **権限の承認ダイアログ** が出ます。
   - 「アクセスを承認」→ Google アカウント選択 → **「詳細」→「(プロジェクト名) に移動 (安全ではないページ)」** を選択 (Google が「警告」を出すのは Workspace 内のスクリプトなので想定内)。
   - スコープ確認 (`Spreadsheet 表示・編集` / `MailApp 送信` / `外部接続`) で **「許可」** をクリック。
7. デプロイ完了画面に表示される **「ウェブアプリ」 URL** をコピー。
   - 形式: `https://script.google.com/macros/s/AKfy.../exec`
   - これを **`GAS_WEBAPP_URL`** として `.env.local` に追記します (次ステップ)。

> 後から URL を確認したい場合: 右上の「デプロイ」→「デプロイを管理」で確認できます。

> **重要**: コードを修正したあとは **「デプロイ」→「デプロイを管理」→ 鉛筆アイコン → 「バージョン: 新しいバージョン」** を選んで再デプロイしないと反映されません。URL は変わりません。

---

## ステップ 4: `.env.local` に環境変数を追記

リポジトリ直下の `.env.local` を開き、以下を追記:

```env
# GAS Web App
GAS_WEBAPP_URL="https://script.google.com/macros/s/...../exec"   # ステップ 3 でコピーした URL
GAS_SECRET="9f3a...d2b1"                                          # ステップ 2-1 で生成した 64 文字 hex

# CMS source (移行 Phase に応じて変更)
CMS_SOURCE="sqlite"               # まずは sqlite のまま。Phase C 以降で spreadsheet に切替
# CMS_SOURCE_COURSE="spreadsheet" # Phase C で Course だけ先に切り替える例
# MAIL_DRIVER="gas"               # メール送信を GAS に切り替える場合 (任意)
```

> `.env.local` は git にコミットされません (`.gitignore` 済み)。Vercel に同じ値を設定するのは **Phase 4 (本番デプロイ整備)** のときに devops が行います。

---

## ステップ 5: `setupSheets()` を 1 回だけ実行する

シートのヘッダ行を自動で作るユーティリティです。**Spreadsheet が空の場合のみ実行** してください (既にデータがあるシートは `clear()` で消されます)。

1. Apps Script エディタ上部の **関数選択ドロップダウン** で `setupSheets` を選ぶ。
2. **▶ (実行) ボタン** をクリック。
3. 初回は権限承認ダイアログが出ます (ステップ 3-6 と同様に許可)。
4. 完了すると、Spreadsheet を開いたときに `Course` / `Lesson` / `Test` / `Question` / `Choice` の 5 シートが追加され、1 行目に日本語併記のヘッダが入っています。
5. ダイアログで **「setupSheets 完了。シート 5 種を初期化しました。」** が表示されれば成功。

> もし「GAS_SECRET が未設定です」というアラートが出たら、ステップ 2 を見直してください。

---

## ステップ 6: 動作確認 (curl で疎通テスト)

ターミナルで以下を実行 (`<URL>` と `<SECRET>` は自分の値に置換):

```bash
URL="<GAS_WEBAPP_URL>"
SECRET="<GAS_SECRET>"
TS=$(node -e 'process.stdout.write(String(Date.now()))')
BODY='{"action":"list_courses"}'
SIG=$(node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha256','${SECRET}').update('${TS}.'+'${BODY}').digest('hex'))")

curl -sS -L -X POST "${URL}?ts=${TS}&sig=${SIG}" \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: ${TS}" \
  -H "X-Signature: ${SIG}" \
  --data "${BODY}"
```

期待されるレスポンス:

```json
{"ok":true,"data":[]}
```

(まだ Course シートにデータがないので空配列が返ります。これで疎通 OK。)

### よくある失敗パターン

| 症状 | 原因 / 対処 |
| --- | --- |
| `{"ok":false,"error":{"code":"INVALID_SIGNATURE"}}` | `GAS_SECRET` が GAS 側 ScriptProperties と LMS 側 `.env.local` で **不一致**。両方を見直す |
| `{"ok":false,"error":{"code":"EXPIRED_TIMESTAMP"}}` | 端末の時刻がずれている (5 分以上)。`date` コマンドで確認、NTP 同期 |
| `{"ok":false,"error":{"code":"INTERNAL","message":"GAS_SECRET is not set"}}` | ScriptProperties に `GAS_SECRET` が未登録 (ステップ 2 をやり直し) |
| HTML が返る (リダイレクト先のログイン画面) | 「アクセスできるユーザー」が **「全員」** になっていない (ステップ 3-4 をやり直し → 再デプロイ) |
| 401 / 404 | GAS Web App URL の末尾が `/exec` でない。**`/dev` ではなく `/exec`** をコピーする |
| `Could not find a part of the path` | `curl` のデバッグオプション `-v` で 302 / 307 リダイレクトが起きていないか確認。`-L` を必ずつける |

---

## ステップ 7: Course シートに 1 件だけ手作業でデータを入れて再確認 (任意)

1. Spreadsheet の `Course` シートを開く。
2. 2 行目に以下を入力:
   - `id (主キー)`: `course_test_001` (任意の cuid もどき文字列で OK、テスト用)
   - `title (コース名)`: `テストコース 1`
   - `description (説明)`: (空欄)
   - `order (表示順)`: `0`
   - `published (公開)`: `TRUE` (大文字、または チェックボックスならチェック)
   - `createdAt (作成日時)`: `2026-05-02T00:00:00Z`
   - `updatedAt (作成日時)`: `2026-05-02T00:00:00Z`
3. ステップ 6 の curl を再実行。

期待される結果:

```json
{"ok":true,"data":[{"id":"course_test_001","title":"テストコース 1","description":"","order":0,"published":true,"createdAt":"2026-05-02T00:00:00Z","updatedAt":"2026-05-02T00:00:00Z"}]}
```

`"published":true` (boolean に変換されている) と `"order":0` (number に変換されている) になっていることを確認してください。これで GAS の型変換ロジックが正常動作している証拠です。

---

## 完了チェックリスト

- [ ] Apps Script に `LMS Spreadsheet Relay` プロジェクト名で .gs コードが保存されている
- [ ] ScriptProperties に `GAS_SECRET` が 64 文字 hex で登録されている
- [ ] ウェブアプリとしてデプロイ済み、URL の末尾が `/exec`
- [ ] `.env.local` に `GAS_WEBAPP_URL` と `GAS_SECRET` が記載されている
- [ ] `setupSheets()` を 1 回実行し、5 シートのヘッダが作成されている
- [ ] curl で `list_courses` が `{"ok":true,"data":[...]}` を返す

すべてチェックが付いたら、Orchestrator に **「GAS セットアップ完了」** と伝えてください。次の Phase B (既存 SQLite データの手作業移植) に進みます。

---

## トラブル時の連絡内容テンプレート

詰まったときは以下の情報を Orchestrator に貼ってください:

```
ステップ N で止まりました。
- Apps Script project URL: https://script.google.com/home/projects/.../edit
- 表示されたエラー / 返ってきたレスポンス本文 (機密情報マスク済み):
  <ここに貼る>
- curl コマンドの -v 出力 (token 部分はマスク):
  <ここに貼る>
```

`GAS_SECRET` の値は **絶対に貼らない** でください。
