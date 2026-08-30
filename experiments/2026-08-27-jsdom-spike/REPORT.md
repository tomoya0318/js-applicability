# jsdom runtime spike

実施日: 2026-08-27

## 目的

browser プロファイルの実行環境として jsdom が使えるかを確かめる。

正確性評価の 16 issue のうち 7 件（Angular 6 / Ember 1）は `test_case_*.js` を持たず、
SUT 自体が `window` と `document` を要求する。
`angular_before.js` はどちらも 105 箇所で参照し、Node で `require` すると
`ReferenceError: window is not defined` になる。
この 7 件を動かせる環境が無ければ、正確性の柱は 16 件から 9 件に縮む。

## 達成条件

`issue_7012` について、jsdom が `angular_before.js` を読み込み、workload を呼び出せること。

対照として `issue_1222` を同じ経路で動かし、Node の CommonJS 経路で得た結果
（`_.values(map)` が 100 要素 `[0..99]`）と一致すること。
一致しなければ、失敗の原因が jsdom なのか runner の作りなのかを切り分けられない。

## 対象外

次はこの実験で確かめない。目的が実行環境の可否に限られるためである。

- **依存の解決**。`../../js/execute.js` と CDN 上の jstat / jQuery が実際に読み込まれる構成は試さない。
  3 つとも所要時間の測定と結果送信のためのもので、EMIC の実行経路に入らない。runner で stub する
- **ベンチマーク時間の測定**。EMIC が見るのは戻り値であって所要時間ではない
- **Playwright との比較**。実ブラウザが必要な等価は本手法の条件語彙では表現できない
- **EMIC の 4 オラクルの設計**。観測項目が未定なので、値が 1 つ取れることだけを見る

## 再現手順

Node はリポジトリの `mise.toml` に合わせて `v24.15.0` を使う。

```sh
cd experiments/2026-08-27-jsdom-spike
mise exec -- pnpm install
mise exec -- pnpm run run
```

`run` は `corpus/fixtures/issue_1222/` と `corpus/fixtures/issue_7012/` の before / after HTML を読み、
実行結果を標準出力と `summary.json` に書く。

使用した版は Node `v24.15.0`、jsdom `30.0.1`、pnpm `11.24.0`。

jsdom の設定は `runScripts: "dangerously"`、`resources` と `url` は既定値。
SUT は `beforeParse` でファイルから読み込んで `window.eval` により注入し、HTML の外部 script は読み込ませていない。

## 結果

達成条件を満たした。4 ケースすべてで SUT の読み込みと workload の呼び出しに成功している。

| fixture | variant | SUT | workload | 観測値 |
| --- | --- | --- | --- | --- |
| issue_1222 | before | 読み込み成功 | `window.f1()` 成功 | `_.values(map)` が長さ 100 で `[0..99]` |
| issue_1222 | after | 読み込み成功 | `window.f1()` 成功 | `_.values(map)` が長さ 100 で `[0..99]` |
| issue_7012 | before | Angular 読み込み成功 | `f1` 呼び出し成功 | 無し（`f1` の戻り値は `undefined`） |
| issue_7012 | after | Angular 読み込み成功 | `f1` 呼び出し成功 | 無し（`f1` の戻り値は `undefined`） |

`issue_1222` は Node の結果と一致した。runner の作りが正しいことの裏付けになる。

`issue_7012` の `f1` は Angular controller のローカル変数なので、`execute` stub が受け取った関数を捕捉して呼んだ。

## 結果から分かった `issue_7012` の性質

`issue_7012` は、書かれたままの形では観測可能な値を持たない。
jsdom の制約ではなく、このケース固有の性質である。実ブラウザでも同じになる。

before / after の差分は 2 か所に現れる。

- `angular_before.js` の内部関数 `sortedKeys`。こちらは `return keys.sort()` を持つ
- `v_before.html` のインラインスクリプトにある同名のコピー。こちらは `keys.sort();` で終わり、戻り値を返さない

workload が呼ぶのは後者で、結果を捨てる。
したがって `reach` は `workload_executed` で止まり、`observable` に到達しない。
`corpus/e2e-cases.json` へ追加するには、観測点を決めるか代表を別の issue に替えるかの判断が要る。

## 実行側の stub

`execute` は時間を測らず workload を捕捉する。
`mean` と `jStat(...).mean()` は固定値を返す。
`$`、`$.ajax`、`$(...).html()` は通信と DOM 更新をしない。

## 確かめられなかったこと

jsdom の版を変えた場合に結果が変わるかは検討していない。
Node の版は独立変数として結果に記録すると決めているが、jsdom の版を同じ扱いにするかは決めていない。

実ブラウザの JavaScript エンジンとの挙動差は確認していない。
jsdom は仕様の JavaScript 実装なので、エンジン固有の逸脱に起因する非等価は検出できない。

`issue_1222` の Node 経路での結果は、依頼時に示された検証済みの事実を前提にした。
fixture と Selakovic 2016 原本の一致も、この実験では再検証していない。

## 結論の移設先

この報告は実測の記録に留める。

実ブラウザを使わない根拠と、それによって測れなくなるものは workspace の `my-research/current.md` のアプローチと妥当性の脅威へ (第 16 版で移設済み)。
プロファイル判定と実行契約は `src/emic/AGENTS.md` を作るときにそこへ。
