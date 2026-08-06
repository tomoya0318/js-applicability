# Research handoff

このディレクトリは、実装を始める前に研究方針と対話で決めた範囲を引き継ぐための文書群でした。
引き継ぎは完了しており、**このディレクトリは解体中です。**

各節は、行き先のディレクトリを作るステージの実装と同じ変更で、最も近い`AGENTS.md`へ移します。
移設先が存在しないうちは移しません。

| 節 | 行き先 |
|---|---|
| `preprocessing-scope.md`の実行可能性・圧縮・評価する指標 | `src/prep/AGENTS.md` |
| `preprocessing-scope.md`の実行環境の扱い（CommonJS初期プロファイル） | `src/emic/AGENTS.md` |
| `dataset-scope.md` | `corpus/README.md` |
| `blocking-decisions.md`の未決定一覧 | 最後まで残す。行き先は別途決める |

全節の移設後に、このディレクトリと`AGENTS.md`の地図の該当行を削除します。

`../current.md`を研究方針の主な参照先とし、現行実装の詳細は原則として持ち込みません。
現行実装の失敗や内部構造は設計の根拠にせず、`current.md`に記述された研究目的と、独立に確認できる研究上の意味論を優先します。

## 文書一覧

| 文書 | 役割 |
|---|---|
| [README.md](README.md) | 文書群のスコープと読み方を示す索引 |
| [dataset-scope.md](dataset-scope.md) | 評価データの二本柱方針（10パターン16issue=正確性 / 残り81issue=拡張性） |
| [preprocessing-scope.md](preprocessing-scope.md) | 前処理の要件、候補方針、評価指標、実行環境の契約 |
| [blocking-decisions.md](blocking-decisions.md) | 着手前に決める必要がある事項。未決定事項のカテゴリ別一覧と、`my-research/open-questions.md`に正本がある着手ブロッカーの参照 |

## この文書群の読み方

- 「決定」は、次プロジェクトの初期スコープとして採用する方針です。
- 「候補」は、実装方法の案であり、採用を決めていません。
- 「未決定」は、教授との相談または小規模な検証後に決める事項です。
