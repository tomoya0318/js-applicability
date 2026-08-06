---
name: land-worktree
description: Rebases onto main if needed, fast-forwards a finished worktree branch into main, pushes main, then removes the herdr worktree and the branch.
disable-model-invocation: true
argument-hint: /land-worktree
---

# worktree を着地させる

PR を作らない運用。単独開発で CI が無いなら、PR 本文はコミットメッセージの複製になる。
決定の台帳は `git log`。

## 中止する条件

次のどちらかなら、実行せず理由を伝えて止まる。

- 未コミットの変更がある → `/commit` を案内する
- main 側の worktree が clean でない

## main を最新にして、必要なら rebase する

先に main 側で origin を取り込む。main に merge commit を作らないので rebase を使う。

    git fetch origin
    git rebase origin/main

**判定は local `main` に対して行う。** マージ先が local `main` なので、
`origin/main` に対して判定すると、local `main` が先に進んでいるときに誤判定する。

    git merge-base --is-ancestor main HEAD

真なら次へ進む。偽なら直系に戻す。

    git rebase main

`git rebase -i` はこの環境で使えないので、squash や並べ替えはしない。
rebase がするのは付け替えだけで、コミットの粒度は `/commit` の時点で決まっている。

衝突したら `git rebase --abort` で戻し、止まってユーザーへ報告する。自分で解決しない。

**rebase したら設定の DoD コマンドを再実行する。**
付け替えた結果は一度も存在しなかった状態であり、まだ検証されていない。

ブランチが origin にあっても force push しない。最後に削除する。

## 着地させる

`herdr worktree list --json` から main 側のパスと、この worktree の workspace id を引く。

main 側で fast-forward マージして push する。

    git merge --ff-only <branch>
    git push origin main

`--no-ff` を使わない。コミットを意図的に独立させてあるなら、まとめる単位を作ると粒度が潰れる。

## 撤収する

`tmp/` は持ち帰らない。plan と review は足場である。

**残したいものが `tmp/` と worktree の外にあれば、削除の前に追跡下へ入れる。**
コミットメッセージと追跡される文書に移し終えたかは人間が判断する。

削除は取り消しにくいので、実行前にユーザーへ確認する。

    herdr worktree remove --workspace <id>
    git branch -d <branch>
    git push origin --delete <branch>    # origin にもある場合だけ

`-D` を使わない。`-d` が未マージを拒否するので安全弁になる。

## 報告

main の HEAD、削除した worktree とブランチを伝える。
**push は local main の全体を publish するので、何が publish されたかを伝える。**
着地させたブランチ以外のコミットが乗っていることがある。
rebase したなら、その旨と DoD の再実行結果も伝える。
