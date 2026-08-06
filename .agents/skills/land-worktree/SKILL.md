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

次のどれかなら、実行せず理由を伝えて止まる。

- 未コミットの変更がある → `/commit` を案内する
- main 側の worktree が clean でない
- `tmp/NNNN_*/plan.md` があり、その節がコミットメッセージに入っていない
  → plan を捨てる運用なので、入っていなければ捨てた時点で消える

## main が先に進んでいたら rebase する

`git fetch origin` して、`origin/main` が HEAD の祖先かを確認する。
祖先なら次へ進む。祖先でなければ直系に戻す。

    git rebase origin/main

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

`tmp/` は持ち帰らない。plan と review は足場であり、残すものはコミットメッセージと
追跡される文書に移してある（中止条件で確認済み）。

worktree の外に置いた成果物があれば、先に追跡下へ入れる。

削除は取り消しにくいので、実行前にユーザーへ確認する。

    herdr worktree remove --workspace <id>
    git branch -d <branch>
    git push origin --delete <branch>    # origin にもある場合だけ

`-D` を使わない。`-d` が未マージを拒否するので安全弁になる。

## 報告

main の HEAD、push の結果、削除した worktree とブランチを伝える。
rebase したなら、その旨と DoD の再実行結果も伝える。
