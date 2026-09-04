import { posix as path } from "node:path";

import { parse } from "@babel/parser";
import traverseModule, { type Binding, type NodePath } from "@babel/traverse";
import * as t from "@babel/types";

import type { Profile } from "../types.ts";

const traverse = traverseModule.default;

export type Side = "before" | "after";

export type FixtureFiles = Readonly<Record<string, string>>;

export type RoleSpan = {
  file: string;
  label: string;
  start: number;
  end: number;
};

export type PrepRoles = {
  harness: RoleSpan & { kind: "commonjs" | "browser-inline" };
  target: { file: string; kind: "separate-file" | "harness" };
  setup: readonly RoleSpan[];
  workload: RoleSpan;
};

// 対象コードは corpus/fixtures/manifest.json の target が両側ぶん宣言する。
// prep は宣言を検証するだけで、規則から導出しない。
export type DeclaredTarget = {
  before: string;
  after: string;
};

type ScriptBlock = {
  content: string;
  contentStart: number;
  contentEnd: number;
  src: string | undefined;
};

type ExportName = "init" | "setupTest" | "test";

function isExportName(value: string): value is ExportName {
  return value === "init" || value === "setupTest" || value === "test";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasFile(files: FixtureFiles, file: string): boolean {
  return Object.prototype.hasOwnProperty.call(files, file);
}

// fixture の外へ出るパスを弾く。対応表のキーは fixture 相対なので、"../" が残ると
// 到達できない先を対象コードと見なしてしまう。
function normalizePath(file: string): string | undefined {
  const normalized = path.normalize(file);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function span(file: string, label: string, node: t.Node, offset = 0): RoleSpan | undefined {
  if (
    node.start === null ||
    node.start === undefined ||
    node.end === null ||
    node.end === undefined
  ) {
    return undefined;
  }
  return { file, label, start: offset + node.start, end: offset + node.end };
}

// 関数宣言と、変数への関数式・arrow 代入を受ける (var / const / let を問わない)。
// 16 fixture が使うのは前者と var への関数式だけだが、宣言子で分ける理由が無いので区別しない。
// それ以外は undefined を返し、呼び出し側で unsupported にする。
function functionPath(binding: Binding): NodePath<t.Function> | undefined {
  if (binding.path.isFunctionDeclaration()) {
    return binding.path;
  }

  if (binding.path.isVariableDeclarator()) {
    const initializer = binding.path.get("init");
    if (!Array.isArray(initializer) && initializer.isFunction()) {
      return initializer;
    }
  }

  return undefined;
}

// 正規表現で exports.init を拾うとコメントや文字列の中の出現も拾う。
// issue_701 のハーネスには // test(initR,setupR); というコメントが実在するため AST で読む。
//
// TODO(未決定): 契約を壊す形を検出していない。exports への再代入、ローカルな var exports による
// shadowing、computed export (exports["test"]) や module.exports との混在、
// 実行されない関数内の export (IIFE を閉じていない形) は、unsupported ではなく誤った結果を返す。
// 16 fixture では起きないので検出を書かない。corpus に fixture を追加したとき、
// これらが無いことを確認する。あれば検出を足す。
function findExportedFunctions(
  ast: t.File,
):
  | { init: NodePath<t.Function>; setupTest: NodePath<t.Function>; test: NodePath<t.Function> }
  | undefined {
  const names: readonly ExportName[] = ["init", "setupTest", "test"];
  const found = new Map<ExportName, NodePath<t.Function>>();
  let invalid = false;

  traverse(ast, {
    AssignmentExpression(exportPath) {
      if (exportPath.node.operator !== "=") {
        return;
      }

      const left = exportPath.node.left;
      if (
        !t.isMemberExpression(left) ||
        left.computed ||
        !t.isIdentifier(left.object, { name: "exports" }) ||
        !t.isIdentifier(left.property)
      ) {
        return;
      }

      const name = left.property.name;
      if (!isExportName(name)) {
        return;
      }

      if (!t.isIdentifier(exportPath.node.right) || found.has(name)) {
        invalid = true;
        return;
      }

      const binding = exportPath.scope.getBinding(exportPath.node.right.name);
      const exportedFunction = binding === undefined ? undefined : functionPath(binding);
      if (exportedFunction === undefined) {
        invalid = true;
        return;
      }

      found.set(name, exportedFunction);
    },
  });

  if (invalid || found.size !== names.length) {
    return undefined;
  }

  const init = found.get("init");
  const setupTest = found.get("setupTest");
  const test = found.get("test");
  if (init === undefined || setupTest === undefined || test === undefined) {
    return undefined;
  }

  return { init, setupTest, test };
}

// require を init の中だけから集める。setup の契約が init で対象コードを読み込む形であり、
// workload 側の require は 16 fixture に存在しない。
// TODO(未決定): init 以外の require を見ていない。宣言された対象コードが test の中で
//読み込まれている場合、到達の検証を通らず unsupported になる (誤った対象は返さない)。
// corpus に fixture を追加したとき、require が init の外に無いことを確認する。
function requireRequests(initPath: NodePath<t.Function>): readonly string[] | undefined {
  const requests: string[] = [];
  let invalid = false;

  initPath.traverse({
    CallExpression(callPath) {
      if (!t.isIdentifier(callPath.node.callee, { name: "require" })) {
        return;
      }

      const [argument] = callPath.node.arguments;
      if (callPath.node.arguments.length !== 1 || !t.isStringLiteral(argument)) {
        invalid = true;
        return;
      }

      requests.push(argument.value);
    },
  });

  return invalid ? undefined : requests;
}

function resolveAsFile(files: FixtureFiles, candidate: string): string | undefined {
  if (hasFile(files, candidate)) {
    return candidate;
  }

  const withExtension = `${candidate}.js`;
  return hasFile(files, withExtension) ? withExtension : undefined;
}

function hasDirectory(files: FixtureFiles, candidate: string): boolean {
  const prefix = `${candidate}/`;
  return Object.keys(files).some((file) => file.startsWith(prefix));
}

// TODO(未決定): 「package.json が無い」「main が無い」「JSON の解析に失敗した」
// 「main の解決先が対応外」をすべて undefined に潰し、呼び出し側がディレクトリの index.js へ進む。
// 後ろ 2 つは Node と挙動が違う (Node は解析失敗をエラーにし、main 配下の index を先に見る)。
// 宣言された対象コードと解決先が食い違えば unsupported になるので誤った対象は返さないが、
// 正しい入力を拒否する。16 fixture では起きないので分けない。corpus に fixture を追加したとき、
// package.json が解析でき main が直接ファイルを指すことを確認する。
function packageMain(files: FixtureFiles, directory: string): string | undefined {
  const packageFile = `${directory}/package.json`;
  if (!hasFile(files, packageFile)) {
    return undefined;
  }

  const packageContents = files[packageFile];
  if (packageContents === undefined) {
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(packageContents);
  } catch {
    return undefined;
  }

  if (!isRecord(value) || typeof value.main !== "string") {
    return undefined;
  }

  const main = normalizePath(path.join(directory, value.main));
  return main === undefined ? undefined : resolveAsFile(files, main);
}

// package.json の main をディレクトリの index.js より先に見る。
// issue_136b の ejs_before_node は index.js が lib/ejs.js への 1 行の再輸出で before/after に差分がなく、
// main を無視すると差分なしと誤判定して対象コードをハーネス自身にしてしまう。
function resolveModule(files: FixtureFiles, request: string): string | undefined {
  const normalized = normalizePath(request);
  if (normalized === undefined) {
    return undefined;
  }

  const file = resolveAsFile(files, normalized);
  if (file !== undefined) {
    return file;
  }

  if (!hasDirectory(files, normalized)) {
    return undefined;
  }

  const main = packageMain(files, normalized);
  if (main !== undefined) {
    return main;
  }

  const index = `${normalized}/index.js`;
  return hasFile(files, index) ? index : undefined;
}

function localRequestPath(harness: string, request: string): string | undefined {
  if (!request.startsWith(".")) {
    return undefined;
  }
  return normalizePath(path.join(path.dirname(harness), request));
}

// 宣言された対象コードを検証する。1 つでも外れたら unsupported にする。
// 規則から導出しないので、宣言が間違っていればここで落ちる。
function verifyTarget(
  files: FixtureFiles,
  declared: DeclaredTarget,
  side: Side,
  harness: string,
  candidates: readonly string[],
): PrepRoles["target"] | undefined {
  const target = declared[side];
  const counterpart = side === "before" ? declared.after : declared.before;

  // 1. 両側とも存在する
  if (!hasFile(files, target) || !hasFile(files, counterpart)) {
    return undefined;
  }

  // 2. ハーネスから到達できるか、ハーネス自身である
  const isHarness = target === harness;
  if (!isHarness && !candidates.includes(target)) {
    return undefined;
  }

  // 3. before と after に差分がある。差分が無ければ等価判定するものが無い
  if (files[target] === files[counterpart]) {
    return undefined;
  }

  return { file: target, kind: isHarness ? "harness" : "separate-file" };
}

function commonjsRoles(
  files: FixtureFiles,
  side: Side,
  declared: DeclaredTarget,
): PrepRoles | "unsupported" {
  const harness = `test_case_${side}.js`;
  if (!hasFile(files, harness)) {
    return "unsupported";
  }

  const harnessContents = files[harness];
  if (harnessContents === undefined) {
    return "unsupported";
  }

  let ast: t.File;
  try {
    ast = parse(harnessContents, { sourceType: "script" });
  } catch {
    return "unsupported";
  }

  const exported = findExportedFunctions(ast);
  if (exported === undefined) {
    return "unsupported";
  }

  const init = span(harness, "init", exported.init.node);
  const setupTest = span(harness, "setupTest", exported.setupTest.node);
  const workload = span(harness, "test", exported.test.node);
  if (init === undefined || setupTest === undefined || workload === undefined) {
    return "unsupported";
  }

  const requests = requireRequests(exported.init);
  if (requests === undefined) {
    return "unsupported";
  }

  const candidates: string[] = [];
  for (const request of requests) {
    const requestPath = localRequestPath(harness, request);
    if (requestPath === undefined) {
      return "unsupported";
    }
    const resolved = resolveModule(files, requestPath);
    if (resolved === undefined) {
      return "unsupported";
    }
    candidates.push(resolved);
  }

  const target = verifyTarget(files, declared, side, harness, candidates);
  if (target === undefined) {
    return "unsupported";
  }

  return {
    harness: {
      file: harness,
      kind: "commonjs",
      label: "harness",
      start: 0,
      end: harnessContents.length,
    },
    target,
    // init と setupTest は元から文の境界に一致するので、そのまま 1 区間ずつにする。
    setup: [init, setupTest],
    workload,
  };
}

function scriptSrc(openingTag: string): string | undefined | null {
  const attributes = openingTag.slice("<script".length, -1);
  const match = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
  if (match !== null) {
    return match[1] ?? match[2] ?? match[3];
  }
  return /\bsrc\b/i.test(attributes) ? null : undefined;
}

// HTML パーサを入れずに正規表現で切り出すため、仕様との差がいくつかある。
// コメント内・属性値内の <script>、type が JavaScript でない script を拾うほか、
// <!-- を含む script は仕様上 double-escaped 状態に入り、その中の </script> はブロックを終えない。
// 16 fixture ではいずれも起きないので検出を書かない。
// TODO(未決定): これらを unsupported として拒否する境界を決めていない。
// corpus に fixture を追加したとき、inline script の切り出しが仕様と一致するかを確認する。
function extractScripts(html: string): readonly ScriptBlock[] | undefined {
  const openings = /<script\b[^>]*>/gi;
  const closings = /<\/script\s*>/gi;
  const scripts: ScriptBlock[] = [];
  let opening: RegExpExecArray | null;

  while ((opening = openings.exec(html)) !== null) {
    const contentStart = openings.lastIndex;
    closings.lastIndex = contentStart;
    const closing = closings.exec(html);
    if (closing === null) {
      return undefined;
    }

    const src = scriptSrc(opening[0]);
    if (src === null) {
      return undefined;
    }

    scripts.push({
      content: html.slice(contentStart, closing.index),
      contentStart,
      contentEnd: closing.index,
      src,
    });
    openings.lastIndex = closings.lastIndex;
  }

  return scripts;
}

function isRemoteScript(src: string): boolean {
  return src.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(src);
}

// TODO(未決定): src の値をファイルパスとしてしか解釈していない。クエリ付き
// (angular_before.js?v=1) や data-src への置き換えは候補から漏れるため、宣言された対象コードが
// 到達の検証を通らず unsupported になる (誤った対象は返さない)。16 fixture では起きないので
// 検出を書かない。corpus に fixture を追加したとき、src がそのままファイル名であることを確認する。
function browserScriptCandidates(
  files: FixtureFiles,
  harness: string,
  scripts: readonly ScriptBlock[],
): readonly string[] {
  const candidates: string[] = [];
  for (const script of scripts) {
    if (script.src === undefined || isRemoteScript(script.src)) {
      continue;
    }

    const candidate = normalizePath(path.join(path.dirname(harness), script.src));
    if (candidate === undefined || !hasFile(files, candidate)) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates;
}

// TODO(未決定): execute 呼び出しの直前で workload 変数が再代入される形と、
// ローカルに定義された同名の execute を検出していない。どちらも unsupported ではなく
// 実際に渡る関数と異なるものを返す。16 fixture では起きないので検出を書かない。
// corpus に fixture を追加したとき、再代入と shadowing が無いことを確認する。
function executeWorkload(
  ast: t.File,
):
  | { name: string; path: NodePath<t.CallExpression>; functionPath: NodePath<t.Function> }
  | undefined {
  let executePath: NodePath<t.CallExpression> | undefined;
  let workloadPath: NodePath<t.Function> | undefined;
  let workloadName: string | undefined;
  let invalid = false;

  traverse(ast, {
    CallExpression(callPath) {
      if (!t.isIdentifier(callPath.node.callee, { name: "execute" })) {
        return;
      }

      if (executePath !== undefined) {
        invalid = true;
        return;
      }

      const [argument] = callPath.node.arguments;
      if (callPath.node.arguments.length < 1 || !t.isIdentifier(argument)) {
        invalid = true;
        return;
      }

      // browser 7 件すべてが execute の呼び出しと同じスコープに workload の関数式を置く。
      // 別スコープからの参照は契約外として unsupported にする。
      const binding = callPath.scope.getBinding(argument.name);
      if (binding === undefined || binding.scope !== callPath.scope) {
        invalid = true;
        return;
      }

      const definition = functionPath(binding);
      if (definition === undefined) {
        invalid = true;
        return;
      }

      executePath = callPath;
      workloadPath = definition;
      workloadName = argument.name;
    },
  });

  if (
    invalid ||
    executePath === undefined ||
    workloadPath === undefined ||
    workloadName === undefined
  ) {
    return undefined;
  }
  return { name: workloadName, path: executePath, functionPath: workloadPath };
}

// execute の呼び出しから Program まで遡り、各階層で「execute を含む文」より前にある文を
// 1 区間にまとめる。外側から内側の順に返す。
// 文の境界で切るので各区間は単体で parse でき、入れ子のスコープは区間の並びが表す。
function setupSpans(
  executePath: NodePath<t.CallExpression>,
  harness: string,
  offset: number,
): readonly RoleSpan[] | undefined {
  const spans: RoleSpan[] = [];

  let current: NodePath = executePath;
  while (true) {
    const statement = current.getStatementParent();
    if (statement === null) {
      return undefined;
    }

    const container = statement.container;
    if (!Array.isArray(container)) {
      return undefined;
    }

    const index = statement.key;
    if (typeof index !== "number") {
      return undefined;
    }

    if (index > 0) {
      const first = container[0];
      const last = container[index - 1];
      if (!t.isNode(first) || !t.isNode(last)) {
        return undefined;
      }
      if (
        first.start === null ||
        first.start === undefined ||
        last.end === null ||
        last.end === undefined
      ) {
        return undefined;
      }
      spans.push({
        file: harness,
        label: spans.length === 0 ? "before execute" : "before execute (outer)",
        start: offset + first.start,
        end: offset + last.end,
      });
    }

    const parent = statement.parentPath;
    if (parent === null || statement.isProgram()) {
      break;
    }
    if (parent.isProgram()) {
      break;
    }
    current = parent;
  }

  // 外側から内側の順に並べ替える。遡りながら積んだので逆順になっている。
  spans.reverse();
  for (const [index, item] of spans.entries()) {
    item.label = spans.length === 1 ? "before execute" : `before execute (${index + 1})`;
  }
  return spans;
}

function browserRoles(
  files: FixtureFiles,
  side: Side,
  declared: DeclaredTarget,
): PrepRoles | "unsupported" {
  const harness = `v_${side}.html`;
  if (!hasFile(files, harness)) {
    return "unsupported";
  }

  const harnessContents = files[harness];
  if (harnessContents === undefined) {
    return "unsupported";
  }

  const scripts = extractScripts(harnessContents);
  if (scripts === undefined) {
    return "unsupported";
  }
  const inline = scripts.filter((script) => script.src === undefined);
  if (inline.length !== 1) {
    return "unsupported";
  }

  const inlineScript = inline[0];
  if (inlineScript === undefined) {
    return "unsupported";
  }

  let ast: t.File;
  try {
    ast = parse(inlineScript.content, { sourceType: "script" });
  } catch {
    return "unsupported";
  }

  const workload = executeWorkload(ast);
  if (workload === undefined) {
    return "unsupported";
  }

  const harnessSpan: RoleSpan & { kind: "browser-inline" } = {
    file: harness,
    kind: "browser-inline",
    label: "inline script",
    start: inlineScript.contentStart,
    end: inlineScript.contentEnd,
  };
  const workloadSpan = span(
    harness,
    workload.name,
    workload.functionPath.node,
    inlineScript.contentStart,
  );
  if (workloadSpan === undefined) {
    return "unsupported";
  }
  // execute より後ろ (jStat や $.ajax) は計測の後処理であり、setup にも workload にも属さない。
  const setup = setupSpans(workload.path, harness, inlineScript.contentStart);
  if (setup === undefined || setup.length === 0) {
    return "unsupported";
  }

  // HTML が読み込まないファイルは候補に入らない。
  const candidates = browserScriptCandidates(files, harness, scripts);
  const target = verifyTarget(files, declared, side, harness, candidates);
  if (target === undefined) {
    return "unsupported";
  }

  return {
    harness: harnessSpan,
    target,
    setup,
    workload: workloadSpan,
  };
}

export function detectRoles(
  profile: Profile,
  files: FixtureFiles,
  side: Side,
  declared: DeclaredTarget,
): PrepRoles | "unsupported" {
  if (profile === "commonjs") {
    return commonjsRoles(files, side, declared);
  }
  if (profile === "browser") {
    return browserRoles(files, side, declared);
  }
  return "unsupported";
}
