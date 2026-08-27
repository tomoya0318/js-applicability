# test/AGENTS.md

**e2e テストのみ。** ユニットテスト・契約テスト・モック・スナップショットを書かない。
`corpus/e2e-cases.json` のケースを実際にステージへ流し、`reach` と `verdict` を照合する。

- 実データは正確性評価の 16 件だけを `corpus/fixtures/<id>/` に置く。
  残り 81 件は corpus に入れず `data/` から流す。全件 1 分の予算はこの 16 件までを前提にする
- 実データで見つけたバグは、**最小合成ケースに落としてから**追加する
- negative ケースを必ず含める。`not_equal` を出せることを検証しないと EMIC は静かに劣化する
- カバレッジ率を使わない。`corpus/README.md` の「軸 × オラクル」格子の空セルが TODO
- 失敗時の診断はコーパスの `why` を assert メッセージに渡して得る
- `node:test` の `test()` は Promise を返すので `void test(...)` と書く。
  本体の await 落ちは lint が捕まえる (`test/**` だけ `ignoreVoid: true`)
