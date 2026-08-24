# js-applicability

JavaScript の (before, after) ペアから、**その変換を安全に適用できる条件を自動抽出する**研究の実装。

Selakovic & Pradel (ICSE 2016) が手動で付与し「自動チェックは今後の課題」とした 5 種類の前提条件
(T / NF / P / TF / V) を、実行ベースの等価性確認によって自動で同定する。

研究計画の正本は [`current.md`](current.md)。**設計判断はすべてそこが根拠**であり、
本 README は実装の入口だけを説明する。

## パイプライン

ステージ境界は論文が報告するファネルの段に一致させてある。

```
(before, after) ──[ prep ]──▶ ──[ equiv ]──▶ ──[ prune ]──▶ ──[ cond ]──▶ 条件
```

| ステージ | 役割 | 出力 |
|---|---|---|
| `prep`  | 実行可能な形に整える | reach ラベル (`parseable` 〜 `observable`)。並びは順序尺度で、弱い段から強い段へ |
| `equiv` | `before ≡ after` を確認 | `equal` / `not_equal` / `inconclusive` |
| `prune` | 構造パターンを導出 | ワイルドカード付き AST パターン |
| `cond`  | 適用条件を抽出 | T / NF / P / TF / V |

各ステージは独立したプロセスで、前段の JSONL を読んで自分の JSONL を書く。
ファネルの数字は各段の結果を数えて出す。

EMIC (入力限定等価確認器) は独立したステージではなく、`prune` と `cond` の内部で使う共通基盤。

## セットアップ

```sh
mise install     # Node 24.15.0 / pnpm 11
mise trust && mise run setup
```

## コマンド

```sh
pnpm stage:prep      # out/01-prep.summary.jsonl を書く
pnpm stage:equiv     # 以降 02, 03, 04
pnpm stage:prune
pnpm stage:cond

pnpm test            # corpus/ の合成ケースを流す e2e テスト
pnpm check           # tsc --noEmit + oxlint + oxfmt --check
pnpm fmt             # 整形 (src scripts test のみ)
```

引数は取らない。入出力パスは各スクリプトに固定で書いてある。

Node の版は EMIC の独立変数なので、`node scripts/prep.ts` と直接叩かない。
PATH 上の別の Node が走りうる。`mise exec` は `mise.toml` を読んでから実行するため、
シェルの状態に依存せず固定した版になる。

```sh
mise exec -- node --inspect scripts/prep.ts   # デバッグでフラグを渡すとき
```

## ディレクトリ

```
src/          純粋なロジック。副作用なし・パス知識なし
  types.ts      verdict / reach / status の唯一の定義
  io.ts         JSONL の読み書き。行数不変と例外処理をここで強制
  emic/         隔離実行と 4 オラクル観測 (共通基盤)
  prep/ prune/ cond/
scripts/      ステージの実行ファイル。4 本のみ
corpus/       答え付きの合成テストケース
data/         原データ (submodule)
test/         e2e テスト
out/          生成物 (git 管理外)
experiments/  使い捨ての実験。<日付>-<名前>/ に REPORT.md と結果
```

依存方向は `scripts/ → src/` の一方通行。逆向きは lint で禁止している。

## テスト

**e2e テストのみを書く。** ユニットテストと契約テストは書かない。

`corpus/cases.jsonl` に「答えを人間が書いた」最小ケースを置き、実際に実行して照合する。
実データ 97 件はテストではなく実験であり、`pnpm test` には含めない。

実データで見つけたバグは、最小合成ケースに落として corpus に追加する。
**期待値の書き換えは禁止**、追加のみ許す。

## 文書

| ファイル | 内容 |
|---|---|
| [`current.md`](current.md) | 研究計画の正本 |
| [`AGENTS.md`](AGENTS.md) | 実装規律 (AI エージェント向け。`CLAUDE.md` はこれへのシンボリックリンク) |
| [`research-handoff/`](research-handoff/) | 設計方針の引き継ぎと着手ブロッカー |

## 適用範囲

初期実行プロファイルは **CommonJS** に限定する。ESM・TypeScript・JSX・bundler 依存コードは
初期スコープ外であり、fallback で救済せず `unsupported` として明示的に計上する。
これは「現代の JavaScript 全体を解析する」という主張をしないという立場の表明でもある。
