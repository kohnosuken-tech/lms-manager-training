# Architecture Decision Records

このディレクトリには重要な技術的意思決定の記録 (ADR) を格納する。

## 命名規則
`NNNN-kebab-case-title.md` (例: `0001-use-clerk-for-auth.md`)

## テンプレート

```markdown
# NNNN. タイトル

- Status: Proposed | Accepted | Superseded by NNNN | Deprecated
- Date: YYYY-MM-DD
- Author: <subagent or person>

## Context
何を、なぜ決める必要があるのか。背景。

## Decision
何を決めたか。

## Consequences
- 良い影響
- 悪い影響 / トレードオフ
- 将来の拡張に与える影響

## Alternatives considered
- 案 A: 採用しなかった理由
- 案 B: 採用しなかった理由
```

## 既存 ADR

| 番号 | タイトル | Status |
| --- | --- | --- |
| 0001 | Mock-first 戦略 | Accepted |
| 0002 | 認証は stub から Clerk へ port 経由で差し替える | Accepted |
| 0003 | Course / Lesson / Test 定義データの CMS に Google Spreadsheet (GAS Web App 経由) を採用する | Superseded by 0006 |
| 0004 | User / Progress / Submission / AuditLog はリレーショナル DB に残す | Superseded by 0006 |
| 0005 | GAS Web App を CMS 読取 + メール送信の統合リレーとして使う | Superseded by 0006 (CMS 部分のみ。メール送信は継続) |
| 0006 | Notion を唯一の DB として採用する (性能・機能の妥協受け入れ) | Accepted |
