# test/AGENTS.md

**e2e テストのみ。** ユニットテスト・契約テスト・モック・スナップショットを書かない。
`corpus/cases.jsonl` の合成ケースを実際にステージへ流し、`reach` と `verdict` を照合する。

- 実データ 97 件を corpus に入れない。遅く不安定になり、全件 1 分の予算が壊れる。
  実データで見つけたバグは、**最小合成ケースに落としてから**追加する
- negative ケースを必ず含める。`not_equal` を出せることを検証しないと EMIC は静かに劣化する
- カバレッジ率を使わない。`corpus/README.md` の「軸 × オラクル」格子の空セルが TODO
- 失敗時の診断はコーパスの `why` を assert メッセージに渡して得る
- `node:test` の `test()` は Promise を返すので `void test(...)` と書く。
  本体の await 落ちは lint が捕まえる (`test/**` だけ `ignoreVoid: true`)
