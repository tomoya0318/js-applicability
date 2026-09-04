# prep の役割分割

実施日: 2026-09-03 (2026-09-08 のレビューを受けて改訂)

## 目的

fixture の片側を **ハーネス・対象コード・setup・workload** の 4 つに静的に分けられるかを確かめる。

後続の削減・プローブ挿入・実行は、どのコードが対象でどこが workload かを知らないと始まらない。
16 fixture が契約どおりに分かれなければ、prep の次段へ進めない。

## 達成条件

正確性評価の 16 fixture すべてについて、次を満たすこと。

- commonjs 9 件はハーネスが `test_case_<side>.js`、workload が `test`、setup が `init` と `setupTest`
- browser 7 件はハーネスが `v_<side>.html` の inline script、workload が `execute` の第 1 引数
- 対象コードが 10 件は別ファイル、6 件はハーネス自身になる
- setup と workload の span を切り出して `@babel/parser` で parse できる
- 契約外の入力は `unsupported` を返す

## 対象外

次はこの実験で確かめない。目的が役割の分割に限られるためである。

- **削減** (計測値からの前方スライス)。どこを残すかは役割が決まってからの判断である
- **プローブ挿入と実行**。`reach` と `verdict` はこの段では出せない
- **span を連結して実行可能な断片にすること**。スコープの再構成は後段の仕事と決めた
- **呼び出しグラフ**。対象コードは corpus の宣言を検証する方式にしたので不要である

## 再現手順

Node はリポジトリの `mise.toml` に合わせて `v24.15.0` を使う。

```sh
node experiments/2026-09-03-prep-equiv-slice/profile-check.ts
```

`corpus/fixtures/manifest.json` の 16 件を読み、`src/prep/profile.ts` と `src/prep/roles.ts` に
流して、スクリプト内の期待表と照合する。食い違えば `throw` する。

使用した版は Node `v24.15.0`、`@babel/parser` `7.29.8`。

## 結果

達成条件を満たした。16 件すべてが契約どおりに分かれ、両側の span がすべて parse できた。

| fixture | profile | 対象コード | 種別 | setup の区間 |
| --- | --- | --- | --- | --- |
| issue_1222 | commonjs | `underscore_before.js` | 別ファイル | `init`, `setupTest` |
| issue_1223 | commonjs | `underscore_before.js` | 別ファイル | `init`, `setupTest` |
| issue_1224 | commonjs | `underscore_before.js` | 別ファイル | `init`, `setupTest` |
| issue_136b | commonjs | `ejs_before_node/lib/ejs.js` | 別ファイル | `init`, `setupTest` |
| issue_27a | commonjs | `chalk_before.js` | 別ファイル | `init`, `setupTest` |
| issue_28 | commonjs | `chalk_before/index.js` | 別ファイル | `init`, `setupTest` |
| issue_347_1 | commonjs | `underscore.string_before.js` | 別ファイル | `init`, `setupTest` |
| issue_39 | commonjs | `underscore_before.js` | 別ファイル | `init`, `setupTest` |
| issue_701 | commonjs | `test_case_before.js` | **ハーネス自身** | `init`, `setupTest` |
| issue_11338 | browser | `v_before.html` | **ハーネス自身** | 1 区間 |
| issue_4359 | browser | `v_before.html` | **ハーネス自身** | 1 区間 |
| issue_4457 | browser | `angular_before.js` | 別ファイル | 2 区間 |
| issue_5457 | browser | `v_before.html` | **ハーネス自身** | 2 区間 |
| issue_7012 | browser | `v_before.html` | **ハーネス自身** | 2 区間 |
| issue_7735 | browser | `angular_before.js` | 別ファイル | 2 区間 |
| issue_7759_3 | browser | `v_before.html` | **ハーネス自身** | 2 区間 |

別ファイル 10 件、ハーネス自身 6 件。両側で対象コードの選択が食い違う fixture は無かった。

setup が 2 区間になる 4 件は、`execute` の呼び出しが `app.controller(...)` のコールバックの
内側にある。外側の準備と内側の準備を別の区間に分けないと、文の途中で切れて parse できない。

## 改訂前に誤っていたこと

初版は対象コードを「ハーネスから到達できて before/after に差分があるファイル」という
規則から導出していた。この規則は `issue_7012` と `issue_5457` で誤った対象を選んだ。

どちらも inline script が対象関数の自前のコピーを定義し、workload が呼ぶのはそちらである。
`angular_<side>.js` にも同名の関数があって差分もあり、HTML も読み込むため、
到達と差分だけでは区別できない。区別するには呼び出しグラフが要る。

`experiments/2026-08-27-jsdom-spike/REPORT.md` が `issue_7012` について
同じことを既に記録していた。初版の期待表はその記録と食い違っていた。

改訂版は `corpus/fixtures/manifest.json` の `target` が両側ぶんを宣言し、
prep は「存在する」「ハーネスから到達できるかハーネス自身である」「両側に差分がある」の
3 つを検証するだけにした。

副次的に、契約外の入力のうち次の 3 つが誤った結果ではなく `unsupported` を返すようになった。
合成入力で確認済みである。

- `package.json` が壊れていて `require` の解決先が変わる
- `<script src>` にクエリが付いて候補から漏れる
- `require` が `init` の外にあって候補に入らない

## 確かめられなかったこと

- **`execute` の第 2 引数 (反復回数) の扱いを決めていない。** 16 件とも `execute(f1, 10)` だが、
  `issue_11338` は `obj` を破壊的に更新し、`issue_4457` は 1 回目で DOM を空にするため、
  1 回目と 10 回目で状態が違う。`research-handoff/preprocessing-scope.md` は
  「計測ループを除く」としているが、畳んでよい条件は未確認である
- **外部依存を固定しないと決めたが、その影響を確かめていない。** `issue_4457` は jQuery を
  先に読み込み、`angular_before.js` の `bindJQuery` が `angular.element` を jQuery に差し替える。
  jQuery を落とすと変換箇所に到達するため、`corpus/e2e-cases.json` の
  `reach: workload_executed` / `verdict: inconclusive` は成立しなくなる。
  **新しい値は実行しないと決まらない。** 実行ステージで確かめてから書き換える
- **契約を壊す入力の一部は、まだ誤った結果を返す。** `exports` への再代入や shadowing、
  `execute` 直前での workload 変数の再代入、`extractScripts` と HTML 仕様の差 (コメント内・
  属性値内の `<script>`、double-escaped 状態) が該当する。`src/prep/roles.ts` の
  `TODO(未決定)` に撤回条件を残した。回帰検証としては保存していない
- **期待表は人手で書いた。** `corpus/e2e-cases.json` は 4 分割を構造化データとして持たないため、
  機械的に導出できない。表が誤っていれば実装と揃って誤る
- **`issue_1224` は `corpus/e2e-cases.json` に項目が無い。** 役割は照合したが `why` と突き合わせていない

## 結論の移設先

この報告は実測の記録に留める。

`scripts/prep.ts` と `test/` ができたら、期待表を `corpus/` へ移して
`profile-check.ts` ごとこの実験を閉じる。役割の照合は e2e が引き継ぐ。

反復回数と外部依存の扱いは研究の設計に関わるので、llm-wiki へ。
