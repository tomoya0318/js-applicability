---
name: implement-approved-plan
description: main で承認済みの plan を受け取り、codex へ実装を委譲して DoD とコミットまで通す。worktree 側で使う。
disable-model-invocation: true
argument-hint: /implement-approved-plan <この worktree の plan.md のパス>
---

# 承認済みの plan を実装する

**worktree 側で使う。** 計画は main で承認済みなので書き直さない。

`/start-implementation` を呼ばない。あの skill は plan を書く手順を含み、
読むと「plan を書くのは常に main である」に引っ張られて再計画が始まる。
委譲の手順はこの文書と `references/` が持つ。

**他の skill のファイルをパスで読まない。** 遅延読み込みが効かないと黙って落ちる。
codex の起動は `run-codex-tab` skill を **Skill として invoke** して任せる。
スクリプトを複製しない。

## 前提

引数は**この worktree の** `plan.md` のパス。`/open-worktree` が
`tmp/<NNNN_name>/` を丸ごとコピーして置いてある。

**main を読まない。** 絶対パスで main の `tmp/` を辿らない。

渡された作業ディレクトリだけで実装できることが、計画が要件を書けている証拠になる。
**足りない情報が出たら、それは plan の欠落である。** 止まってユーザーへ報告する。
main を読んで埋めると、渡し忘れが見えないまま実装だけが進む。

計画を変える必要が出たときも同じで、**止まって報告する。**
plan は main で直してコピーし直す。この worktree で書き換えない。

## 1. plan を読み、現物と噛み合うかを確かめる

`概要` `要件` `方針` `リスク` を読む。
`実装手順` は実現性の下見であって指示ではない。

`方針` が現物のコードと噛み合うかを、触る対象のファイルだけ読んで確かめる。
噛み合っていなければ、実装に入らずユーザーへ報告する。

## 2. 委譲プロンプトを書く

[references/impl-prompt-skeleton.md](references/impl-prompt-skeleton.md) の `<...>` を埋め、
この worktree の `tmp/<NNNN_name>/impl-prompt-<name>.md` へ書き出す。

**骨組みから項目を減らさない。** とくに次の 3 つは、消すと codex が実装者以外の役を演じ始める。

- 「あなたは末端の実装者である。タブを起動しない。skill を実行しない」
- `AGENTS.md` を読ませないこと。守らせたい規律は本文へ転記する
- 判断が要るときは `NEEDS_USER_DECISION:` で止める一択にすること

2026-09-03 に、`AGENTS.md` 読了指示から `.agents/skills/` を辿った codex が
自分を委譲役と解釈し、4 段の連鎖を起こして実装が 1 行も進まなかった。

## 3. codex を起動する

**`run-codex-tab` skill を invoke する。** YAML はこの形にする。
```yml
task: impl
model: gpt-5.6-luna
effort: xhigh
sandbox: workspace-write
name: impl-<name>
cwd: <この worktree のパス>
prompt_file: <この worktree>/tmp/<NNNN_name>/impl-prompt-<name>.md
result_file: <この worktree>/tmp/<NNNN_name>/impl-result-<name>.md
no_wait: true
```

**effort は `xhigh` にする。** 作業が機械的に見えても下げない。
下げてよい条件を書くと毎回下がる。

**この worktree の workspace で起動する。** タブは呼び出し元の workspace に作られるので、
main から呼ぶと並行レーンの codex タブが main 側に溜まって区別できなくなる。

### 起動は 1 回だけ

**失敗したと思っても、起動し直す前に走っているものを確かめる。**

    herdr agent list

同じ `name` と `result_file` で複数の codex が立つと、全部が同じ結果ファイルを見張り、
自分の子の出力と親への提出物を区別できなくなる。

`no_wait: true` で起動したら `run-codex-tab` の待ち方に従って待つ。
`needs-user` が返ったら論点をユーザーへ提示し、止まっている tab へ回答を届ける。
**自分で判断しない。**

## 4. DoD を実行する

`.claude/impl-workflow.md` の DoD コマンドを、変更範囲に応じて自分で実行する。
codex の報告を信用して省かない。

## 5. コミットする

コミットは 1 つ。plan が単位そのものなので切り分けない。

**本文には `tmp/<NNNN_name>/plan.md` の `概要` `要件` `方針` `リスク` をそのまま入れる。要約しない。**
`実装手順` は入れない。差分が示すうえに、承認も検証もしていない。

コード側で `要件` と食い違う箇所があれば、コミット前にユーザーへ伝える。
**plan を書き換えて辻褄を合わせない。**

## 6. 着地は main から

`/land-worktree` は main 側で起動する。worktree からは呼ばない。
tab はコミットまで通ってからまとめて閉じる。
