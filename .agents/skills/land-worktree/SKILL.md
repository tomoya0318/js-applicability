---
name: land-worktree
description: Rebases onto main if needed, fast-forwards a finished worktree branch into main, pushes main, then removes the herdr worktree and the branch.
disable-model-invocation: true
argument-hint: /land-worktree
---

# worktree を着地させる

PR を作らない運用。単独開発で CI が無いなら、PR 本文はコミットメッセージの複製になる。
決定の台帳は `git log`。

**worktree 側で起動する。** 着地させる対象がそこにあり、未コミットの確認も worktree に対して行う。
main 側の操作は `git -C <main のパス>` で外から行う。
ただし worktree を削除する前には main 側へ移動する。自分が居るディレクトリを消すと cwd が失われる。

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

状態は 3 通りある。2 通りだと思って分岐を 1 つにすると、着地済みのブランチを
rebase して main まで fast-forward させ、無関係なコミットを吸い込む。

    git merge-base --is-ancestor HEAD main   # feature が main の祖先か
    git merge-base --is-ancestor main HEAD   # main が feature の祖先か

| 前者 | 後者 | 状態 | すること |
|---|---|---|---|
| 真 | — | 着地済み | マージしない。撤収へ進む |
| 偽 | 真 | 直系 | `merge --ff-only` |
| 偽 | 偽 | 分岐 | `git rebase main` してから `merge --ff-only` |

`git rebase -i` はこの環境で使えないので、squash や並べ替えはしない。
rebase がするのは付け替えだけで、コミットの粒度は `/commit` の時点で決まっている。

衝突したら `git rebase --abort` で戻し、止まってユーザーへ報告する。自分で解決しない。

**rebase したら設定の DoD コマンドを再実行する。**
付け替えた結果は一度も存在しなかった状態であり、まだ検証されていない。

ブランチが origin にあっても force push しない。最後に削除する。

## 着地させる

`herdr worktree list --json` から引く。
main 側のパスは `source.repo_root`、この worktree の workspace id は
自分のパスに一致する `worktrees[]` の `open_workspace_id`。

着地済みでなければ、main 側で fast-forward マージする。

    git merge --ff-only <branch>

`--no-ff` を使わない。コミットを意図的に独立させてあるなら、まとめる単位を作ると粒度が潰れる。

そのうえで push する。

    git push origin main

## 撤収する

`tmp/` は main やリモートへ持ち帰らないが、worktree を削除する前に chezmoi の共通履歴へ退避する。

履歴の保存先は `$(chezmoi source-path)/history/<リポジトリ名>/<日時とブランチ名>/` とする。
`tmp/` が存在する場合は、次のように worktree 側で保存する。

    worktree_path="$(pwd)"
    main_path="<main のパス>"
    chezmoi_root="$(chezmoi source-path)"
    repo_name="$(basename "$(git -C "$main_path" rev-parse --show-toplevel)")"
    branch_name="$(git -C "$worktree_path" branch --show-current | tr '/' '-')"
    timestamp="$(date +%Y%m%d-%H%M%S)"
    archive_dir="$chezmoi_root/history/$repo_name/${timestamp}_${branch_name}"

同じ保存先がすでに存在する場合は、上書きせずに停止してユーザーへ報告する。
保存先を作成し、`.launch-*` を除外して `tmp/` の内容をコピーする。

    if [ -d "$worktree_path/tmp" ]; then
      if [ -e "$archive_dir" ]; then
        echo "履歴の保存先がすでに存在します: $archive_dir" >&2
        exit 1
      fi
      mkdir -p "$(dirname "$archive_dir")"
      mkdir "$archive_dir"
      if ! rsync -a --exclude='.launch-*' "$worktree_path/tmp/" "$archive_dir/"; then
        echo "履歴の退避に失敗しました。worktree は削除しないでください" >&2
        exit 1
      fi
    else
      echo "tmp/ が存在しないため、履歴の退避はありません"
    fi

コピーが失敗した場合は、worktree を削除せずに停止する。
コピーが成功したことを確認してから、保存先を報告する。
`tmp/` が存在しない場合は履歴の退避を行わず、保存先が無いことを報告する。

履歴は chezmoi の `history/` に保存し、main リポジトリへ追加したり、リモートへ push したりしない。

削除は取り消しにくいので、実行前にユーザーへ確認する。
履歴の退避と保存先の確認が済んだ後、worktree を消す前に main 側へ移動する。

    herdr worktree remove --workspace <id>
    git branch -d <branch>
    git push origin --delete <branch>    # origin にもある場合だけ

`-D` を使わない。`-d` が未マージを拒否するので安全弁になる。

## 報告

main の HEAD、削除した worktree とブランチを伝える。
**push は local main の全体を publish するので、何が publish されたかを伝える。**
着地させたブランチ以外のコミットが乗っていることがある。
rebase したなら、その旨と DoD の再実行結果も伝える。
履歴を退避したなら、その保存先も伝える。
