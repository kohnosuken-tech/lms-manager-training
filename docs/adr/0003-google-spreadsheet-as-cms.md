# 0003. Course / Lesson / Test 定義データの CMS に Google Spreadsheet (GAS Web App 経由) を採用する

- Status: **Superseded by ADR 0006** (2026-05-02)
- Date: 2026-05-02
- Author: architect subagent
- Related: ADR 0001 (mock-first), ADR 0004 (リレーショナル DB に残すエンティティ), ADR 0005 (GAS Web App をリレー基盤として採用)
- Supersedes: 内部レビューで一時採択していた「Notion を CMS に使う案 (案 C)」を破棄し、本 ADR で置き換える。

> **2026-05-02 追記 (Superseded)**: 社内合意により Spreadsheet → Notion へ全面移行することが決定。本 ADR は ADR 0006 によって完全に置き換えられた。CMS 系 (Course/Lesson/Test/Question/Choice) は Notion DB として再定義される。Spreadsheet/GAS は Phase G 完了で停止する (移行プランは `docs/architecture.md` §11 参照)。

## Context

LMS の「コース構造」「レッスン教材」「テスト出題」など、ADMIN が頻繁に編集する **定義データ** を、どの基盤で管理するかを決める必要がある。

要件:
- ADMIN が **エンジニアの介在なし** に教材を増減できること。
- 100 ユーザー規模・社内利用。トラフィックは小さいが、ADMIN の編集頻度は高い (週次レベルでコース追加 / 修正)。
- 既存の管理 UI を作り込むコストを節約したい (画面工数より教材整備工数が支配的)。
- 監査要件: 「誰がいつ何を変更したか」は LMS 側 `AuditLog` に集約する方針 (ADR 0004)。

事前検討:
- 当初は **Notion** を CMS として使う案 (案 C: Notion を Source of Truth、SQL は書込系のみ) を採用しかけた。
- ところがプロジェクトオーナーが **Notion ワークスペースの管理者権限を保有していなかった**。Integration の作成・データベース ID の発行・権限付与のいずれも自身で完結できないため、運用継続性に重大なリスクがあった。
- 同等の「テーブル状 UI + 外部 API + 既存社内利用」を満たす代替として **Google Spreadsheet + Google Apps Script (GAS) Web App** を選んだ (Spreadsheet ID と Apps Script project は既にプロジェクトオーナーが作成済み、権限保有済み)。

## Decision

以下のエンティティを **Google Spreadsheet (= GAS Web App 経由) を Source of Truth** として扱う:

- `Course`
- `Lesson`
- `Test`
- `Question`
- `Choice` (= 既存 Prisma の `Choice` 相当)

LMS (Next.js / Prisma) からは **直接 Spreadsheet API を叩かず、必ず GAS Web App をリレーしてアクセスする**。詳細プロトコルは ADR 0005 に分離。

### 案 C との関係性

案 C (Notion を CMS、SQL を書込系) の「**読み取り専用 CMS と書込系 RDB を分離する**」という根本方針は維持する。CMS 実体だけが Notion → Spreadsheet に置き換わる。

| 項目 | 案 C (Notion 案・破棄) | 本 ADR (Spreadsheet 案) |
| --- | --- | --- |
| 定義データの編集 UI | Notion データベース | Google Spreadsheet (シート) |
| LMS からのアクセス手段 | Notion API (公式 SDK, OAuth Integration) | GAS Web App (HMAC 署名付き HTTP) |
| 認証の自前実装 | 不要 (Notion Integration Token) | 必要 (HMAC-SHA256 + timestamp) |
| 編集時の監査 | Notion 側の Activity Log | Spreadsheet の編集履歴 + LMS `AuditLog` |
| 全文検索 / 複雑クエリ | Notion 側で可能 | 不可 (GAS でフィルタ追加が必要) |
| 権限分離 | Notion ワークスペース ACL | Google ドライブ共有 + GAS Web App 公開設定 |
| **採用ブロッカー** | **オーナーが Notion 管理者権限を持たない** | なし |

## Consequences

### 良い影響
- ADMIN が普段使い慣れた Spreadsheet UI で教材を編集できる (学習コストほぼゼロ)。
- 編集履歴 (Spreadsheet の「変更履歴」) を Google 側でも確認できる (法的監査の補助証跡)。
- LMS 側に教材 CRUD 用の管理画面を実装しなくてよい (画面工数の大幅削減)。
- Spreadsheet の数式・条件付き書式・データ検証で、ADMIN 自身がバリデーションを強化できる。

### 悪い影響 / トレードオフ
- 強い型保証がない。`boolean` 列に文字列が入る、`order` 列が空欄になる等の事故が起こり得る。GAS / LMS 両側で zod 風スキーマ検証を実装する必要がある。
- リレーション (Lesson → Course の外部キー整合) を DB 側で強制できない。GAS の `setupSheets()` でデータ検証 (リスト) を入れるが、最終的な整合性チェックは LMS 側で行う。
- GAS Web App には実行時間 6 分 / URL Fetch 20,000/日 などの制限があり、高頻度書込は不可。詳細は ADR 0004。
- ADMIN が誤って列を消す・並べ替えるリスク。**列名で参照** (1 行目のヘッダ名で位置を解決) する実装にして緩和する。

### 将来の拡張に与える影響
- 教材種別が増えた場合 (例: PDF 教材、Markdown 教材)、新シートを追加して GAS の action を増やすだけで対応できる。
- もし GAS の制限がボトルネックになった場合、Cloud Run / Cloudflare Workers 等の薄いリレーに置き換える余地がある (HMAC プロトコルは流用可能)。

## Alternatives considered

- **Notion (案 C)**: 採用直前まで進んだが、オーナーの権限不足で破棄。再採用時は本 ADR を Supersede する形で記録する。
- **LMS 内部に管理画面を作る (案 A)**: 既存 ADR 案で検討済。画面工数が大きい上に、教材編集体験は Spreadsheet/Notion に劣る。100 名規模では過剰。
- **MicroCMS / Contentful などの SaaS Headless CMS**: コストと、社内データを外部 SaaS に置くことの追加リスク回避のため見送り。
- **Google Spreadsheet を直接 Sheets API で叩く (GAS なし)**: OAuth サービスアカウント運用 + Sheets API のレート制限 (100 read / 100 write per 100 sec per project) を LMS が直接受けることになる。GAS をリレーに挟むことで、認証の集約・送信メールの統合・将来差替の自由度を得る (ADR 0005)。

## リスクと緩和

| リスク | 緩和 |
| --- | --- |
| ADMIN が列を削除 / 並べ替えてしまう | GAS は **ヘッダ名で列を解決**。列の位置に依存しない |
| 必須列が空欄のまま LMS に流れる | GAS で zod 風バリデーション → エラーは `{ ok: false, error }` で返す |
| Spreadsheet の編集履歴が大量で重くなる | Google 側で 30 日履歴は自動。1 シート 1000 行を超えたら別ファイル分割を検討 |
| GAS Web App URL の流出 = 全教材の閲覧可能 | HMAC 署名 + timestamp 必須化 (ADR 0005)。URL のみでは何も叩けない |
| Spreadsheet ID / GAS URL の所有者が個人アカウント | 切替時に組織アカウントに移管する手順を `docs/deployment-gas.md` に記載 |
