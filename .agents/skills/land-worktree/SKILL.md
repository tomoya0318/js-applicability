---
name: land-worktree
description: main から起動し、指定した worktree のブランチを必要なら rebase して main へ fast-forward し、push してから worktree とブランチを削除し、main の作業ディレクトリを片づける。
disable-model-invocation: true
argument-hint: /land-worktree <ブランチ名>
---

# worktree を着地させる

PR を作らない運用。単独開発で CI が無いなら、PR 本文はコミットメッセージの複製になる。
決定の台帳は `git log`。

**main 側で起動する。** worktree は削除する対象なので、そこに居ると自分の足元を消すことになる。
以前は「削除の前に main へ移動する」という注記で避けていたが、実行場所を変えれば分岐ごと要らない。

**対象は引数で必ず受け取る。** `herdr worktree list` から推測しない。
並行して複数の worktree がある前提なので、推測すると別のブランチを着地させる。

worktree 側の操作は `git -C "$worktree_path"` で外から行う。

    worktree_path="$(herdr worktree list --json | jq -r --arg b "<branch>" \
      '.result.worktrees[] | select(.branch == $b) | .path')"

引数のブランチに一致する worktree が無ければ、実行せずに報告して止まる。

## 中止する条件

次のどちらかなら、実行せず理由を伝えて止まる。

- worktree に未コミットの変更がある (`git -C "$worktree_path" status --short`) → `/commit` を案内する
- main が clean でない。追跡外の `tmp/` は汚れに数えない

## main を最新にして、必要なら rebase する

先に main で origin を取り込む。main に merge commit を作らないので rebase を使う。

    git fetch origin
    git rebase origin/main

**判定は local `main` に対して行う。** マージ先が local `main` なので、
`origin/main` に対して判定すると、local `main` が先に進んでいるときに誤判定する。

状態は 3 通りある。2 通りだと思って分岐を 1 つにすると、着地済みのブランチを
rebase して main まで fast-forward させ、無関係なコミットを吸い込む。

    git merge-base --is-ancestor <branch> main   # feature が main の祖先か
    git merge-base --is-ancestor main <branch>   # main が feature の祖先か

| 前者 | 後者 | 状態 | すること |
|---|---|---|---|
| 真 | — | 着地済み | マージしない。撤収へ進む |
| 偽 | 真 | 直系 | `merge --ff-only` |
| 偽 | 偽 | 分岐 | `git -C "$worktree_path" rebase main` してから `merge --ff-only` |

`git rebase -i` はこの環境で使えないので、squash や並べ替えはしない。
rebase がするのは付け替えだけで、コミットの粒度は `/commit` の時点で決まっている。

衝突したら `git -C "$worktree_path" rebase --abort` で戻し、止まってユーザーへ報告する。
自分で解決しない。

**rebase したら、マージする前に worktree 側で DoD コマンドを再実行する。**
付け替えた結果は一度も存在しなかった状態であり、まだ検証されていない。
`cd` せずに worktree を指定して走らせる。

    pnpm -C "$worktree_path" check
    pnpm -C "$worktree_path" test

ブランチが origin にあっても force push しない。最後に削除する。

## 連続して着地させるとき

1 本着地させると main が進むので、**2 本目以降は必ず「分岐」になり rebase と DoD 再実行が要る。**
main から起動する形なら、この連鎖を 1 か所で回せる。着地順は共有面を触る方から先に決める。

1 本ごとに、rebase → DoD → `merge --ff-only` → 撤収 まで通してから次へ移る。
まとめて rebase してから順にマージしない。途中で衝突したとき、どこまで検証済みか分からなくなる。

## 着地させる

着地済みでなければ、main で fast-forward マージする。

    git merge --ff-only <branch>

`--no-ff` を使わない。コミットを意図的に独立させてあるなら、まとめる単位を作ると粒度が潰れる。

そのうえで push する。

    git push origin main

## 作業ディレクトリを main へ戻す

worktree を削除する前に、`tmp/<NNNN_name>/` を main の `tmp/done/` へ移す。
**worktree 側が正本である。** 実装中に plan を直すことがあり、記録
(`impl-prompt-*.md` / `review.md` / `impl-result-*.md`) も worktree にしかない。

`tmp/dig/` の議事録は main にしかないので、ここでは動かさない。

    work_dir="$(ls "$worktree_path/tmp" | head -1)"   # <NNNN_name>
    dest="$(git rev-parse --show-toplevel)/tmp/done/$work_dir"

`<NNNN_name>` が 1 つに定まらなければ、実行せずユーザーに訊く。推測で移さない。

    if [ -e "$dest" ]; then
      echo "移動先がすでに存在します: $dest" >&2
      exit 1
    fi
    mkdir -p "$(dirname "$dest")"
    if ! rsync -a --exclude='.launch-*' "$worktree_path/tmp/$work_dir/" "$dest/"; then
      echo "移動に失敗しました。worktree は削除しないでください" >&2
      exit 1
    fi
    rm -rf "$(git rev-parse --show-toplevel)/tmp/$work_dir"

同名がすでに `done/` にある場合は、上書きせず停止して報告する。
コピーが失敗した場合も、worktree を削除せずに停止する。

**`done/` へ移すことが、生きている計画との区別になる。**
以前は main の `tmp/<NNNN_name>/` を消していた。残すと「これはまだ生きている計画か」を
判断できなくなるからだが、場所で決まるなら判断が要らない。

`tmp/` は追跡しない。**`done/` の中身は、次の振り返りまでしか存在しない。**
マシンが変われば消える。消えて困るものが残っていないかは、振り返りで確かめる。

## worktree を削除する

削除は取り消しにくいので、実行前にユーザーへ確認する。

    git worktree remove --force "$worktree_path"
    git branch -d <branch>
    git push origin --delete <branch>    # origin にもある場合だけ
    herdr workspace close <id>

workspace id は同じ JSON の `.result.worktrees[] | select(.branch == $b) | .open_workspace_id`。

**`--force` を使う。** このリポジトリは `data/` を submodule に持つので、
`herdr worktree remove` も素の `git worktree remove` も次の理由で拒否する。

    fatal: working trees containing submodules cannot be moved or removed

判定は index の gitlink があるかどうかで決まり、submodule が初期化されているかは見ていない。
したがって `mise run setup` で submodule を入れなくても同じエラーが出る。

**`submodule deinit` を worktree で実行しない。** `.git/config` は worktree 間で共有されるので、
main 側の登録まで外れる (`git submodule status` の先頭が `-` になる)。
それでも `remove` は通らないので、試す意味がない。
踏んだ場合は main で `git submodule update --init` で戻す。ファイルは消えず、登録だけが外れる。

`herdr worktree remove` を使わないので、workspace は `herdr workspace close` で別に閉じる。

`-D` を使わない。`-d` が未マージを拒否するので安全弁になる。

## 振り返りの時期を知らせる

行き場の確認は、着地のたびではなく `tmp/done/` が溜まったときにまとめて行う。
1 本ごとに 7 行の表を確認しても、直後は「行き場なし」が少なく、判断が形骸化する。

    count="$(ls -1 "$(git rev-parse --show-toplevel)/tmp/done" 2>/dev/null | wc -l | tr -d ' ')"

**3 本以上なら、`/skill-retro` を実行するようユーザーへ伝える。** 自分で実行しない。
着地とは別の作業であり、承認が要る。

閾値は 3 本にハードコードしてある。少ないと毎回に近づいて儀式になり、
多いと材料が古びて読み直しのコストが上がる。回してから決め直す。

## 報告

main の HEAD、削除した worktree とブランチを伝える。
**push は local main の全体を publish するので、何が publish されたかを伝える。**
着地させたブランチ以外のコミットが乗っていることがある。
rebase したなら、その旨と DoD の再実行結果も伝える。
履歴を退避したなら、その保存先も伝える。
`tmp/done/` へ移した作業ディレクトリと、`done/` の現在の本数を伝える。
3 本以上なら `/skill-retro` を促す。
