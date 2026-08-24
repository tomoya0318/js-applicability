# 実装ワークフロー設定

## DoD コマンド
- check (lint + typecheck + fmt): pnpm check
- test: pnpm test

## worktree セットアップコマンド
mise trust && mise run setup

## レビュー重点領域
- 未決定の扱い: 設定項目・フラグ・strategy への抽象化や fallback の追加を差分に持ち込んでいないか。
  未決定はその場にハードコードし、`// TODO(未決定): 理由と、決まったら何をするか` を残しているか。
  研究の設計に関わる選択は `research-handoff/blocking-decisions.md` に追記しているか。

## 理解ゲートのドメイン文言
実装に入る前に、次を言語化すること。

- この変更は EMIC の 4 オラクル観測のどの段階に影響するか（prep / equiv / prune / cond のどこか）
- 対応外の入力を `unsupported` / `inconclusive` として返しているか。fallback を書いていないか
- 実行環境（Node のバージョン）が結果に影響する変更か。影響するなら結果 JSON に記録されるか

## 作業 dir
tmp/
