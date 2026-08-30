---
name: research-context
description: >
  js-applicability から ai-research-workspace の研究情報を調査する。
  研究方針、設計理由、実装優先度、未決事項、実験結果、論文・概念の根拠を
  尋ねられたときに使う。ユーザーが skill 名を指定していなくても、研究計画
  と実装の関係、current.md の主張、OQ-NNN、条件抽出、EMIC、K1〜K8、
  T/NF/P/TF/V、Table 4、次に実装すべきことについて質問したら使う。
  workspace を読み取り専用で検索し、根拠のファイルパス・行番号・版・更新日
  を付けて回答する。js-applicability 側の実装コードだけで完結する質問には使わない。
---

# Research context

`ai-research-workspace` は研究情報の正本であり、`js-applicability` はその実装と実験の正本である。
この skill は両者を結ぶ読み取り専用の調査経路である。

## 1. 参照先を解決する

最初に環境変数 `TRACE_PAPER_DIR` を確認する。
未設定の場合は、workspace の場所を推測せず、設定が必要だと報告して停止する。

解決したルート以外のディレクトリを探索しない。
可能なら、次の resolver で workspace の入口を検証する。

```sh
bash "$TRACE_PAPER_DIR/.agents/skills/research-bridge/scripts/resolve-context.sh" \
  --paper-dir "$TRACE_PAPER_DIR" \
  --code-dir "$PWD"
```

少なくとも次の入口を確認する。

- `$TRACE_PAPER_DIR/my-research/index.md`
- `$TRACE_PAPER_DIR/my-research/current.md`
- `$TRACE_PAPER_DIR/wiki/index.md`
- `$TRACE_PAPER_DIR/wiki/agent-protocol.md`

入口が不足している場合は、読めた範囲と不足しているパスを報告する。

## 2. 質問に応じて読む

いきなり `current.md` 全体を読むのではなく、まず `my-research/index.md` で現在の入口と優先事項を確認する。
その後、質問に対応する正本を読む。

| 質問 | 最初に読む場所 | 必要な場合に追加で読む場所 |
|---|---|---|
| 現在の研究方針・主貢献 | `my-research/current.md` | `my-research/claims.md` |
| 次に実装すること・優先度 | `my-research/index.md` | `my-research/notes/scope.md`、`current.md` |
| 設計理由・主張の根拠 | `current.md` | `claims.md`、参照先の `wiki/` |
| 未決事項・判断待ち | `my-research/open-questions.md` | `current.md`、関連する `notes/` |
| 実験結果・計測値 | `my-research/results/` | `current.md`、実験のコミット・環境情報 |
| 論文・概念・関連手法 | `wiki/index.md` | `wiki/agent-protocol.md`、`wiki/papers/`、`wiki/concepts/`、`wiki/syntheses/` |
| 過去の判断・版の比較 | `my-research/versions/`、`my-research/log.md` | ユーザーが履歴を尋ねた場合だけ読む |

`my-research/current.md` が研究ストーリーの正本である。
`js-applicability` はミラーを持たないため、研究計画に関する記述は必ず workspace 側を読んで答える。

`claims.md` は主張と根拠の台帳であり、`current.md` にない要件を勝手に追加するためには使わない。
`results/` の数値は計測時点・コードコミット・実行環境に依存するため、確定した一般事実として扱わない。
`wiki/` は論文・概念の事実層であり、自分の研究上の提案や設計判断の根拠をそこから推測しない。

## 3. 検索する

概念的な検索には `mcp__semble__search` を使う。
検索対象の `repo` には必ず `$TRACE_PAPER_DIR` を渡し、質問に応じて `content` を選ぶ。

- 研究文書の質問: `content: all`
- Wiki や調査報告の質問: `content: docs`
- 設定やパスの質問: `content: config`

検索クエリは、関数名ではなく「何を知りたいか」を短く記述する。
検索結果の `file_path` と行番号を使って、そのファイルを直接読む。
同じ内容をもう一度全体検索しない。

全出現箇所が必要なリテラル検索だけは `rg` を使ってよい。
`tmp/` や PDF 原本を通常検索の対象に含めない。

Wiki を読む場合は、`wiki/agent-protocol.md` の search → read → follow の順序に従う。
paper / concept の `type`、`status`、`sources`、`relations` を確認し、出典のない断定を補わない。

## 4. 回答に含める根拠

研究情報を使った回答では、少なくとも次を明示する。

- 参照した workspace のルート
- `current.md` の version / updated、または対象文書の date / updated
- 重要な事実ごとの `絶対パス:行番号`
- 研究計画の記述、実装の事実、推測を分離した説明
- 判断できない点と、未決事項なら `OQ-NNN`

回答は、次の形を基本にする。

```markdown
## 結論
<質問への短い回答>

## 根拠
- <研究計画または主張> (<絶対パス>:<行番号>)
- <実験結果または Wiki の事実> (<絶対パス>:<行番号>)

## 注意点
- <版、計測時点、未決事項、未確認の範囲>
```

根拠が見つからない場合は「workspace に記載なし」と明示する。
実装の存在だけから研究上の有効性、健全性、性能を断定しない。

## 5. 更新境界

この skill は workspace と `js-applicability` の文書を変更しない。
調査中に誤りや計画変更の必要性を見つけても、勝手に修正せず、対象パスと修正案だけを報告する。
研究計画の変更は workspace 側で行い、実験結果の取り込みも明示的な依頼を受けてから行う。
`raw/`、`tmp/`、個人用の未整理資料は、ユーザーが明示的に指定した場合を除いて参照しない。
