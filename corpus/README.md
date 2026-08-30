# corpus — 評価データの方針

> **2026-07 教授MTGでの更新**: 評価データを二本柱に再編しました。
> 10パターンに紐づく16issueで生成手法の正確性を語り、残り81issue（パターン外の個別最適化）で拡張性を語ります。
> 「パターン外issueを初期実装の主対象にしない」という旧方針は、拡張性評価用データとしての採用に置き換えます。

## 決定

Selakovicデータセット（全97issue）を、役割の異なる二本柱に分けて使います。

| 柱 | 対象 | 語ること | 指標 |
|---|---|---|---|
| **正確性** | 10パターンに紐づく16issue | 生成手法（条件抽出）の正確さ | Selakovic Table 4の手付けラベル（T/NF/P/TF/V）に対するprecision / recall |
| **拡張性** | 残り81issue（パターン外の個別最適化） | 手法が既知パターンの外へどこまで適用できるか | 段階別通過率・条件出力の有無・`inconclusive`率（主指標は未決定） |

正確性の16issueは、Selakovicの手動パターン・条件ラベルを利用できる唯一の範囲であり、条件抽出の正誤評価に適しています。
拡張性の81issueは条件GTを持たないため、正誤ではなく適用可能性を測ります。
二本柱の指標を同じ集計に混ぜません。

## 16issueの内訳

16issueの対応は、現行リポジトリの手動キュレーション済み対応表で確認できます。
対応表は旧プロジェクトの手動キュレーションに由来し、その内容は下表に転記済みです。
元のファイル名は出典として残しますが、対応表は`pattern_map.py`、分類処理は`classify_dataset.py`に記録されていました。
この対応表は、`Description.md`の最適化内容をもとにしたプロジェクト側の注釈です。
上流データセットが16issueを正式な機械可読ラベルとして提供している、という意味ではありません。

issueのIDは、分類表で使われている論理IDと、データセット上の物理パスで表記が異なります。
以下では、物理パスに合わせて`issues/`を含めています。

| パターン | 変換の概要 | issue |
|---|---|---|
| P1 | `for-in`（`hasOwnProperty`付きの場合を含む）→ `Object.keys` / `for` | `clientIssues/AngularIssues/issues/issue_7012`<br>`clientIssues/AngularIssues/issues/issue_7759_3`<br>`clientIssues/EmberIssues/issues/issue_11338`<br>`clientServerIssues/UnderscoreIssues/issues/issue_1222`<br>`clientServerIssues/UnderscoreIssues/issues/issue_1223`<br>`clientServerIssues/UnderscoreIssues/issues/issue_1224` |
| P2 | `str.substr(i, 1)` → `str[i]` | `clientServerIssues/EjsIssues/issues/issue_136b` |
| P3 | `String(v)` → `'' + v` | `clientServerIssues/Underscore.stringIssues/issues/issue_347_1` |
| P4 | `.html('')` → `.empty()` | `clientIssues/AngularIssues/issues/issue_4457` |
| P5 | `substr(0, 2)` → `charAt` 2回 | `clientIssues/AngularIssues/issues/issue_5457` |
| P6 | `split(x).join(y)` → `replace(/x/g, y)` | `clientServerIssues/UnderscoreIssues/issues/issue_39` |
| P7 | `toString.call(x)` → `instanceof` | `clientIssues/AngularIssues/issues/issue_7735`<br>`serverIssues/MochaIssues/issues/issue_701` |
| P8 | `x % 2` → `x & 1` | `clientIssues/AngularIssues/issues/issue_4359` |
| P9 | `arr.reduce(...)` → `for` loop | `serverIssues/ChalkIssues/issues/issue_28` |
| P10 | `[].slice.call(arguments).join(...)`の単一要素特化 | `serverIssues/ChalkIssues/issues/issue_27a` |

件数はP1が6件、P7が2件、その他の8パターンが各1件で、合計16件です。

### 各パターンの前提条件

自動適用に必要な前提条件は、原論文の Table 4 が定めています。
出典は Selakovic & Pradel, "Performance Issues and Optimizations in JavaScript: An Empirical Study" (ICSE 2016) の Table 4 です。
条件抽出（RQ1）の正解ラベルはこの表です。

T = Type check、NF = Native function is not overridden、P = Prototype is not overridden、
TF = Function from third-party library is not overridden、V = Check on value of an expression。

| パターン | T | NF | P | TF | V |
|---|:-:|:-:|:-:|:-:|:-:|
| P1 | 要 | 要 | 要 | — | — |
| P2 | 要 | — | 要 | — | — |
| P3 | — | 要 | — | 要 | — |
| P4 | 要 | — | — | 要 | — |
| P5 | 要 | 要 | 要 | — | — |
| P6 | 要 | 要 | 要 | — | — |
| P7 | — | 要 | 要 | — | 要 |
| P8 | 要 | — | — | — | — |
| P9 | 要 | 要 | 要 | — | — |
| P10 | 要 | — | 要 | — | — |

論文本文が2箇所で個別に補足しています。
P4は`html()`と`empty()`がjQueryの関数であることを要求します（TF）。
P7は`toString`が`Object.prototype.toString()`を指すことを要求します（V）。

### 境界例として別管理するissue

次のissueは10パターンに近いものの、現在の対応表では主評価の16issueに含めていません。

- `clientIssues/EmberIssues/issues/issue_4329_1`: P1類だが`Object.keys`ではなく直接アクセス。
- `clientServerIssues/Underscore.stringIssues/issues/issue_347_2`: P2/P5類だが`indexOf` / `lastIndexOf`への変更。
- `clientServerIssues/NodeLruCacheIssues/issues/issue_8`: P1の逆方向で、`Object.keys[i]`から`for-in`への変更。
- `serverIssues/Socket.ioIssues/issues/issue_689`: P2類だが、二つの`substring`呼び出しを一つにする変更。

これらは正確性の16issueへ追加せず、境界例として別管理します。
16issue側・81issue側のどちらに帰属させるかは未決定です（→ 未決定事項）。

### パターンの帰属が原文の定義と食い違うissue

`clientIssues/AngularIssues/issues/issue_7735`をP7に割り当てていますが、原文の定義と一致しません。
原文のPattern 7は「`toString()`による型判定の代わりに`instanceof`演算子を選ぶ」と定義し、
例も`err instanceof Error || toString.call(err) === "[object Error]"`です。
一方この issue の変換は`toString.call(value) === '[object Array]'`から`Array.isArray`への置き換えで、
`instanceof`を使いません。共通するのは「`toString.call`による型判定をより速い組み込みへ置き換える」点だけです。

同じP7の`serverIssues/MochaIssues/issues/issue_701`は原文どおり`instanceof`を使います。
RQ1はパターン単位で集計するため、性質の異なる2件が同じラベルに突き合わされることになります。

対応表は旧プロジェクトの手動キュレーション由来であり、帰属を変えると16件という件数と
二本柱の分母が動きます。現時点では帰属を変えず、食い違いの記録に留めます。

## 拡張性評価データ（残り81issue）

パターン外の個別最適化81issueは、手法が既知10パターンの外へどこまで適用できるかを示す拡張性評価に使います。

- 条件GT（T/NF/P/TF/Vラベル）を持たないため、**正誤（precision / recall）は測りません**。
- 測るのは適用可能性です: 前処理通過、等価判定通過、枝切り通過、条件抽出が出力を出せたか、`inconclusive`率。
- 現行集計の下地: 97issue → 前処理通過79 → 等価判定通過65 → 枝切り通過45。パターン外81issueのうち枝切り通過は34です。
- 失敗・非対応は隠さず、`unsupported` / `inconclusive`として段階別に計上します。実行プロファイル（CommonJS限定）が拡張性のカバレッジ上限を決めるため、非対応の内訳も報告します（[preprocessing-scope.md「実行環境の扱い」](../research-handoff/preprocessing-scope.md#実行環境の扱い)）。

通過率の集計に加えて、81issueに対して次の2つの分析を行います。

1. **クラスタリング**: 81issueをクラスタリングし、件数の多いクラスタを論文中で個別に議論します。クラスタリングの方法（特徴量・アルゴリズム・クラスタ数の決め方）は教授と要相談です。
2. **既知パターンのラッピング検証**: 81issueのうち、既知10パターンを内部に含む（ラッピングしている）ものがどれだけあるかを検証します。ラッピングの判定基準は未決定です。

拡張性評価の未決定事項は、[blocking-decisions.md](../research-handoff/blocking-decisions.md)に集約します。

## 正確性評価を16issueに限定する理由

- 研究対象のパターンが明確になる。
- T/NF/P/TF/VのGTと直接対応する。
- パターン外の個別最適化を扱うための一般的な分類器を、最初から作らずに済む（81issueは分類せず、パイプラインをそのまま通して適用可能性だけを測る）。
- client、server、依存関係、DOMなどの実行差を、対象範囲の中で明示的に整理できる。
- 前処理の複雑さが研究の主題を侵食することを防ぎやすい。

## 限定による注意点

このデータだけで、JavaScript全体への一般化は主張しません。
issue数が少なく、パターンごとの件数にも偏りがあるため、全体の単一precision / recallだけで評価しません。
パターンごとの結果、issueごとの結果、実行プロファイルごとの結果を分けて報告します。

また、既存ラベルと実行結果が食い違うケースは、無理にラベルへ合わせません。
等価性、非等価性、判定不能、ラベル不一致を別状態として記録します。

## 開発用データと外部妥当性

### 開発用データ

主評価issueから作る最小実行ケース、条件違反の変異ケース、依存関係を整理した再現ケースを使います。
これらは前処理とexecutorの開発に使い、正確性・拡張性の集計には直接混ぜません。

### 外部確認データ（当面見送り）

Selakovic外の小規模OSSから、主対象と同じパターンに対応し、実行プロファイルを満たすケースを少数集める案はあります。
ただし、外部OSS適用（案A）は当面見送ります。
論文の質が要求すれば復活します。

外部確認を実施しないため、2016年データと単一の収集方法に由来する経年および出所バイアスは、外部妥当性を示せない限界として記録します。

## 未決定事項

データセットに関する未決定事項は、[blocking-decisions.md](../research-handoff/blocking-decisions.md)に集約します。

## 自作ケースのGT

自作ケースを作る場合、GTを一つの真偽値にまとめません。

| GTの種類 | 内容 |
|---|---|
| 構造GT | どのAST差分が変換本体か |
| 等価性GT | どの入力領域でbefore / afterが等価か |
| 条件GT | T/NF/P/TF/Vのどの条件が必要か |
| 実行GT | parse可能、対象到達、実行成功、判定不能などの状態 |

条件GTは、抽出器自身の出力を根拠にしてはいけません。
人手アノテーション、原論文のラベル、独立実装、小さい入力領域の全列挙など、抽出器と別の根拠を使います。

条件違反の変異ケースは有用ですが、変異生成規則と抽出器が同じ規則に依存すると循環するため、変異ケースだけをGTの根拠にはしません。

## データリークへの対応

主評価ケースを、設計・デバッグ・最終評価のすべてで使い回さないようにします。
少なくとも、開発用ケースと最終報告用ケースを分けます。
件数が少ないため、単純なランダム分割より、issue単位・プロジェクト単位で分けた結果を併記する方が適切です。
