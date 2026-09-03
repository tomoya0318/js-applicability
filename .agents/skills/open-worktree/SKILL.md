---
name: open-worktree
description: main で承認済みの作業ディレクトリを worktree へ丸ごと渡し、Claude を起動して実装を始めさせる。main 側で使う。
disable-model-invocation: true
argument-hint: /open-worktree <ブランチ名> <tmp/NNNN_name>
---

# worktree を開いて実装を渡す

**main 側で使う。** 計画は main で承認済みなので、worktree では書き直させない。

`/start-implementation` を新 workspace で呼ばない。あの skill は plan を書く手順を含み、
読ませると承認済みの要件と別版ができる。

## 渡すのは作業ディレクトリ 1 つだけ

`tmp/<NNNN_name>/` を**丸ごとコピーして渡す。それ以外は渡さない。**

議事録 (`tmp/dig/`)・作業定義・他の plan は渡さない。
worktree からは main を読ませない。

**足りない情報が出たら、それは plan に落とせていない情報である。**
dig で決めたことを plan に反映し忘れた、という失敗をここで検出する。
main を読めるようにすると、その欠落が見えなくなって実装だけが進む。

足りないと分かったら、**main で plan を直してコピーし直す。** worktree 側で埋めない。

## 中止する条件

- `tmp/<NNNN_name>/plan.md` が無い、またはユーザーの承認を得ていない → main での `/start-implementation` を促す
- main の作業ツリーが clean でない → `/commit` を案内する。追跡外の `tmp/` は汚れに数えない

## ブランチ名

引数が英数字・スラッシュ・ハイフンだけならそのまま使う。
説明なら `feature/` `fix/` `chore/` `refactor/` のいずれかを付け、英語のハイフン区切りへ変換する。

## 1. checkout と workspace を用意する

状態は 3 通りある。1 つだと思って `create` だけを書くと、
checkout が残っている状態でブランチ既存のエラーになる。

| `git worktree list` | `herdr worktree list` | すること |
|---|---|---|
| ない | ない | `herdr worktree create --cwd . --branch <name> --focus` |
| **ある** | ない | `herdr worktree open --cwd . --branch <name> --focus` |
| ある | ある | `herdr workspace focus <id>` |

`herdr worktree list --json` の結果は `.result.worktrees[]` に入っている。
`path` `branch` `open_workspace_id` をそこから引く。

workspace が閉じても checkout は残る。`git worktree list` に出て
`herdr worktree list` に出ないのが、その状態の判定条件である。

## 2. セットアップする

`.claude/impl-workflow.md` の worktree セットアップコマンドを、その checkout で実行する。
`node_modules` が既にあるなら省いてよい。

## 3. 作業ディレクトリをコピーする

    mkdir -p <worktree>/tmp
    cp -R <main>/tmp/<NNNN_name> <worktree>/tmp/

`plan.md` を含むディレクトリごと運ぶ。中身を選り分けない。
選り分けると、何を渡し忘れたのかが後から分からなくなる。

## 4. Claude を起動する

    herdr agent start <name> --kind claude --pane <workspace の root pane>

pane id は手順 1 の JSON の `root_pane.pane_id`。
起動後 `agent_status` が `idle` になるまで待つ。

## 5. プロンプトを送る

    herdr agent prompt <name> "/implement-approved-plan tmp/<NNNN_name>/plan.md"
    herdr pane send-keys <pane> alt+enter

**打ち込みと送信は別に送る。** `herdr agent prompt` はテキストを入れるだけで送信せず、
`agent_prompt_stalled` を返す。

**送信キーは `~/.claude/keybindings.json` の `Chat` コンテキストから引く。**
この環境では `enter` が `chat:newline`、`alt+enter` が `chat:submit` に割り当てられている。
既定の Enter で送ると改行が入るだけで、いつまでも送信されない。

**プロンプトは 1 行に保つ。** 改行を含めると貼り付けブロック (`[Pasted text #1]`) になり、
バッファが複数行のまま抜けられなくなる。補足は `plan.md` に書く。

渡すパスは **worktree 内の相対パス**にする。main の絶対パスを渡すと、worktree が main を読み始める。

`up` を押させない。履歴が開いて余計な文字が入る。
