# LMS 要件定義 (ドラフト)

> このドキュメントは Phase 0 で作成したドラフト。Phase 1 で `architect` subagent が確定させる。

## 1. プロジェクトゴール
社内マネージャー向けに、動画教材配信、視聴進捗管理、条件付きテスト機能を提供する LMS を構築する。

## 2. 利用者
- **STUDENT (受講者)**: 約 100 名のマネージャー
- **ADMIN (管理者)**: 教材登録、ユーザー管理、進捗確認担当

## 3. 主要機能 (ドラフト — Architect が確定)

### 3.1 認証
- Clerk によるメール / パスワードログイン
- Vercel BotID によるログイン保護
- ロール: STUDENT / ADMIN
- パスワードポリシーは Clerk の既定値 (要 ADR で確認)

### 3.2 ユーザー管理 (ADMIN)
- 個別作成、CSV 一括作成、無効化 (論理削除)
- 役割割当 (STUDENT / ADMIN 切替)
- 招待メール (Resend 経由)

### 3.3 教材管理 (ADMIN)
- 動画アップロード (Vercel Blob, private mode)
- コース (動画の集合) 作成
- レッスン単位での早送り抑止フラグ
- 受講者 / コース割当 (Enrollment)

### 3.4 学習 (STUDENT)
- マイページで担当コース一覧と進捗を表示
- 動画視聴 (10 秒間隔で進捗自動保存)
- 早送り抑止モード対応
- 完了率の表示

### 3.5 テスト
- ADMIN: テスト作成、prerequisite (受講条件 = コース完了) 設定、合格基準、再受験上限
- STUDENT: 受験、自動採点、結果確認
- 不合格時の再受験 (上限あり)
- 出題形式: 択一 / 複数選択 (記述は将来検討)

### 3.6 進捗管理 (ADMIN)
- ダッシュボード (受講率、合格率、未完了者一覧)
- CSV エクスポート (ユーザー / コース / 進捗)

## 4. 非機能要件
- **セキュリティ**: OWASP Top 10 を意識した実装、Vercel BotID、private Blob
- **パフォーマンス**: Fluid Compute による安定したレスポンス (関数の起動時間最小化)
- **可用性**: Vercel SLA に準拠
- **監査**: 重要操作 (ログイン、ユーザー作成、教材変更、ロール変更) を `AuditLog` に記録
- **データ保持**: Neon Postgres を Marketplace のバックアップ機能で日次保護

## 5. 想定外スコープ (本リリースでは対応しない)
- モバイルアプリ
- SSO / SAML
- 多言語対応
- ライブ配信
- ディスカッション機能 / コメント
- 決済機能

## 6. 確定事項 — 詳細は `docs/decisions.md` を参照
Phase 1 で 6 項目 (認証 / 動画 / テスト / メール / 集計 / 完了率判定) を確定済み。各項目のモック挙動・本番挙動・切替手順は `docs/decisions.md` にまとまっている。

## 7. 教材定義データの管理基盤 (2026-05-02 追記)
Course / Lesson / Test / Question / Choice の **教材定義データ** は Google Spreadsheet を Source of Truth とし、LMS からは GAS Web App をリレー経由でアクセスする。詳細は ADR 0003 / 0004 / 0005 と `docs/architecture.md` §8〜§10、ユーザー向け手順書は `docs/deployment-gas.md` を参照。
受講履歴系 (User / Enrollment / Progress / Submission / Answer / AuditLog / MailDelivery) は引き続きリレーショナル DB (mock = SQLite, 本番 = Neon Postgres) に置く。
