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

## 撤収する

`tmp/` は main やリモートへ持ち帰らないが、worktree を削除する前に chezmoi の共通履歴へ退避する。
退避するのは、`/open-worktree` が複製した作業ディレクトリと、実装中に生まれた記録
(`impl-prompt-*.md` / `review.md` / `impl-result-*.md`) である。
`tmp/dig/` の議事録は main にしかないので、ここでは動かさない。

履歴の保存先は `$(chezmoi source-path)/history/<リポジトリ名>/<日時とブランチ名>/` とする。

    chezmoi_root="$(chezmoi source-path)"
    repo_name="$(basename "$(git rev-parse --show-toplevel)")"
    branch_name="$(echo "<branch>" | tr '/' '-')"
    timestamp="$(date +%Y%m%d-%H%M%S)"
    archive_dir="$chezmoi_root/history/$repo_name/${timestamp}_${branch_name}"

同じ保存先がすでに存在する場合は、上書きせずに停止してユーザーへ報告する。
保存先を作成し、`.launch-*` を除外して `tmp/` の内容をコピーする。

`/open-worktree` が作業ディレクトリを worktree へ複製しているので、
この退避だけで main 側の控えも取れる。二重にコピーしない。
計画を直したら main で直してコピーし直す運用なので、worktree 側が最新である。

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
**`history/` は chezmoi 側で追跡されないローカル限りの控えである。**
消えて困るものが `tmp/` に残っていないかを、退避の前に確認する。

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

## main の作業ディレクトリを片づける

worktree を消したら、main の `tmp/<NNNN_name>/` も消す。
残すと、次に入る自分が「これはまだ生きている計画か」を判断できない。

作業ディレクトリの名前は、退避した worktree の `tmp/` の中身から引く。
`/open-worktree` が複製した `<NNNN_name>/` がそこにある。
見つからなければユーザーに訊く。推測で消さない。

**消すのは `tmp/<NNNN_name>/` だけである。**
`tmp/dig/` の議事録と作業定義は main に残す。dig は main で行うので、あそこが唯一の置き場になる。

### 消す前に、行き場を確かめて提案する

作業ディレクトリの中身のうち、コミットにもコードにも残らないものがある。
**消す前に一覧で提案し、ユーザーの承認を得る。承認が無ければ消さない。**

| 中身 | 既に残る場所 | 残っていないときの行き場 |
|---|---|---|
| `plan.md` の `概要` `要件` `方針` `リスク` | コミット本文 (規約) | コミットが規約どおりか確かめる |
| `impl-result` の「満たせなかった要件」 | どこにもない | 次の plan、または `research-handoff/blocking-decisions.md` |
| `impl-result` の「前提として置いたこと」 | どこにもない | `// TODO(未決定)` かコミット本文 |
| `impl-result` の「`TODO(未決定)` を残した箇所」 | コード | `grep -rn "TODO(未決定)" src scripts` で実在を確かめる |
| `review.md` の却下した指摘 | どこにもない | `// TODO(未決定)` か `blocking-decisions.md` |
| 撤回しにくく長期的な影響を持つ設計判断 | — | `adr-writing` で ADR |
| 計画を変えた理由 | — | main の `tmp/dig/` |

`impl-prompt-*.md` は plan からの派生物なので、行き場を要求しない。

**「行き場なし」を黙って消さない。** 却下した指摘や置いた前提が消えると、
次に同じ論点へ当たったときに、一度考えたことをもう一度考える。

退避はしてある (`history/`) が、あれは chezmoi 側で追跡されないローカル限りの控えであり、
永続化ではない。行き場の提案を省く理由にはならない。

## 報告

main の HEAD、削除した worktree とブランチを伝える。
**push は local main の全体を publish するので、何が publish されたかを伝える。**
着地させたブランチ以外のコミットが乗っていることがある。
rebase したなら、その旨と DoD の再実行結果も伝える。
履歴を退避したなら、その保存先も伝える。
消した main の作業ディレクトリと、行き場を移したものを伝える。
