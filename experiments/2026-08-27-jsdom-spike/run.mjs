import { writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const require = createRequire(import.meta.url);
const jsdomVersion = require("jsdom/package.json").version;
const experimentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(experimentDir, "../..");

function describeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack,
  };
}

function describeValue(value) {
  if (value === undefined) return { type: "undefined" };
  if (value === null) return { type: "null", value: null };
  return { type: typeof value, value };
}

function installStubs(window, state) {
  // issue_7012 の f1 は controller のローカル変数で window から見えない。
  // execute が受け取った関数を捕捉して、あとから直接呼ぶ
  window.execute = (workload) => {
    state.executeStubCalled += 1;
    state.capturedWorkload = workload;
    return [];
  };

  window.mean = () => 0;
  window.jStat = () => ({ mean: () => 0 });

  // $.ajax は測定結果を http://localhost:8081 へ POST する。受け手が無いので潰す
  const dollar = () => ({ html: () => undefined });
  dollar.ajax = () => undefined;
  window.$ = dollar;
}

async function runFixture(issue, variant) {
  const fixtureDir = resolve(repoRoot, "corpus/fixtures", issue);
  const html = await readFile(resolve(fixtureDir, `v_${variant}.html`), "utf8");
  const sut = await readFile(resolve(fixtureDir, `${issue === "issue_1222" ? "underscore" : "angular"}_${variant}.js`), "utf8");
  const state = {
    issue,
    variant,
    sutEvaluated: false,
    sutLoaded: false,
    executeStubCalled: 0,
    workloadAttempted: false,
    workloadCalled: false,
    returnExtracted: false,
    workloadReturn: null,
    observation: null,
    errors: [],
    capturedWorkload: null,
  };
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    state.errors.push({ stage: "jsdom", ...describeError(error) });
  });

  let dom;
  try {
    dom = new JSDOM(html, {
      runScripts: "dangerously",
      virtualConsole,
      beforeParse(window) {
        window.addEventListener("error", (event) => {
          state.errors.push({
            stage: "script",
            name: event.error?.name ?? "Error",
            message: event.message,
            stack: event.error?.stack,
          });
        });
        installStubs(window, state);
        // jsdom は <script src> を読み込まない。かつ HTML のインラインスクリプトより先に
        // SUT が居ないと angular.module() で落ちるので、パース前に注入する
        try {
          window.eval(sut);
          state.sutEvaluated = true;
        } catch (error) {
          state.errors.push({ stage: "sut", ...describeError(error) });
        }
      },
    });
    const globalName = issue === "issue_1222" ? "_" : "angular";
    state.sutLoaded = state.sutEvaluated && typeof dom.window[globalName] !== "undefined";
    // angular の controller は DOMContentLoaded の後に登録される。
    // 1 tick 待たないと execute stub がまだ呼ばれていない
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));

    if (issue === "issue_1222") {
      state.workloadAttempted = typeof dom.window.f1 === "function";
      if (state.workloadAttempted) {
        state.workloadReturn = describeValue(dom.window.f1());
        state.workloadCalled = true;
        state.returnExtracted = true;
      }
      if (state.sutLoaded && state.workloadCalled) {
        const values = Array.from(dom.window._.values(dom.window.map));
        // summary.json は目視レビューの対象なので全要素は残さない。
        // 等価判定そのものは本番の EMIC が行う
        state.observation = {
          operation: "_.values(map)",
          length: values.length,
          values: { head: values.slice(0, 3), tail: values.slice(-3) },
        };
      }
    } else {
      state.workloadAttempted = typeof state.capturedWorkload === "function";
      if (state.workloadAttempted) {
        state.workloadReturn = describeValue(state.capturedWorkload());
        state.workloadCalled = true;
        state.returnExtracted = true;
      }
      state.observation = {
        operation: "f1 (captured from execute)",
        return: describeValue(state.workloadReturn),
      };
    }
  } catch (error) {
    state.errors.push({ stage: "jsdom-construction", ...describeError(error) });
  } finally {
    dom?.window.close();
  }

  state.status = state.sutLoaded && state.workloadCalled && state.returnExtracted && state.errors.length === 0 ? "success" : "failure";
  delete state.capturedWorkload;
  return state;
}

const results = [];
for (const issue of ["issue_1222", "issue_7012"]) {
  for (const variant of ["before", "after"]) {
    results.push(await runFixture(issue, variant));
  }
}

const summary = {
  node: process.version,
  jsdom: jsdomVersion,
  options: {
    runScripts: "dangerously",
    resources: "default (external resources not loaded)",
    url: "default",
  },
  results,
};
await writeFile(resolve(experimentDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
