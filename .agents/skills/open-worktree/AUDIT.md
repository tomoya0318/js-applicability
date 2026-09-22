# 監査メタデータ

このファイルはエージェントが読まない。`skill-lint` と `skill-audit` のためにある。
`SKILL.md` からリンクしない。

fork 元: start-worktree

## 落とした工程

各行は `<fork 元の見出しまたは手順の逐語引用> — <落とした理由>` の形にする。
逐語引用は `skill-lint` が fork 元と照合するので、要約しない。

現在はない。fork 元の工程はすべて残しているか、形を変えて持っている。

## 落としていないが形を変えたもの

- `herdr worktree create --cwd . --branch <name> --focus` で作成し、新しい workspace を起動する。
  は 3 通りの状態に分けた。checkout だけが残っていると、`create` はブランチ既存のエラーになる。
  `git worktree list` に出て `herdr worktree list` に出ないのが、その状態の判定条件である。
- `セットアップ完了後、新 workspace で /start-implementation を実行する。`
  は `/implement-approved-plan` を送る形にした。plan は main で承認済みなので、
  新 workspace で `/start-implementation` を呼ぶと再計画が始まる。
