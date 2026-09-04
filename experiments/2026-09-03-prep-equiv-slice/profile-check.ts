// prep の役割分割を 16 fixture へ流し、人手で書いた期待表と照合する。REPORT.md の再現手順。
// scripts/prep.ts と test/ ができたら、期待表を corpus/ へ移してこの実験ごと閉じる。

import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { detectProfile } from "../../src/prep/profile.ts";
import {
  detectRoles,
  type DeclaredTarget,
  type FixtureFiles,
  type PrepRoles,
  type Side,
} from "../../src/prep/roles.ts";
import { parse } from "@babel/parser";
import type { Profile } from "../../src/types.ts";

type Manifest = {
  issues: readonly ManifestIssue[];
};

type ManifestIssue = {
  id: string;
  fixture: string;
  target: DeclaredTarget;
};

type E2eCase = {
  id: string;
  profile: Profile;
};

type ExpectedRoles = {
  harness: string;
  target: string;
  setup: readonly string[];
  workload: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isManifestIssue(value: unknown): value is ManifestIssue {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fixture === "string" &&
    isRecord(value.target) &&
    typeof value.target.before === "string" &&
    typeof value.target.after === "string"
  );
}

function parseManifest(value: unknown): Manifest {
  if (!isRecord(value) || !Array.isArray(value.issues) || !value.issues.every(isManifestIssue)) {
    throw new Error("invalid fixture manifest");
  }

  return { issues: value.issues };
}

function isE2eCase(value: unknown): value is E2eCase {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.profile === "commonjs" || value.profile === "browser")
  );
}

function parseE2eCases(value: unknown): readonly E2eCase[] {
  if (!Array.isArray(value) || !value.every(isE2eCase)) {
    throw new Error("invalid e2e cases");
  }

  return value;
}

// 再帰的に読む。issue_28 の chalk_before/index.js と issue_136b の ejs_before_node/lib/ejs.js は
// サブディレクトリにあり、直下だけでは require の解決先に届かない。
// src/prep/roles.ts は副作用を持たないので、ファイル読み込みはこの確認スクリプト側で行う。
async function readFixtureFiles(fixtureRoot: string): Promise<FixtureFiles> {
  const files: Record<string, string> = {};

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath =
        relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files[relativePath] = await readFile(absolutePath, "utf8");
      }
    }
  }

  await visit(fixtureRoot, "");
  return files;
}

// 16 fixture を人手で読んで書いた期待表。corpus/e2e-cases.json はこの 4 分割を
// 構造化データとして持たないため、機械的に導出できない。
// この表が間違っていれば実装と揃って間違うので、レビューでは表そのものを現物と突き合わせる。
const expectedRoles = new Map<string, ExpectedRoles>([
  [
    "issue_1222",
    {
      harness: "test_case_before.js",
      target: "underscore_before.js",
      setup: ["init", "setupTest"],
      workload: "test",
    },
  ],
  [
    "issue_1223",
    {
      harness: "test_case_before.js",
      target: "underscore_before.js",
      setup: ["init", "setupTest"],
      workload: "test",
    },
  ],
  [
    "issue_1224",
    {
      harness: "test_case_before.js",
      target: "underscore_before.js",
      setup: ["init", "setupTest"],
      workload: "test",
    },
  ],
  [
    "issue_136b",
    {
      harness: "test_case_before.js",
      target: "ejs_before_node/lib/ejs.js",
      setup: ["init", "setupTest"],
      workload: "test",
    },
  ],
  [
    "issue_27a",
    {
      harness: "test_case_before.js",
      target: "chalk_before.js",
      setup: ["init", "setupTest"],
      workload: "test",
    },
  ],
  [
    "issue_28",
    {
      harness: "test_case_before.js",
      target: "chalk_before/index.js",
      setup: ["init", "setupTest"],
      workload: "test",
    },
  ],
  [
    "issue_347_1",
    {
      harness: "test_case_before.js",
      target: "underscore.string_before.js",
      setup: ["init", "setupTest"],
      workload: "test",
    },
  ],
  [
    "issue_39",
    {
      harness: "test_case_before.js",
      target: "underscore_before.js",
      setup: ["init", "setupTest"],
      workload: "test",
    },
  ],
  [
    "issue_701",
    {
      harness: "test_case_before.js",
      target: "test_case_before.js",
      setup: ["init", "setupTest"],
      workload: "test",
    },
  ],
  [
    "issue_11338",
    {
      harness: "v_before.html",
      target: "v_before.html",
      setup: ["before execute"],
      workload: "f1",
    },
  ],
  [
    "issue_4359",
    {
      harness: "v_before.html",
      target: "v_before.html",
      setup: ["before execute"],
      workload: "f1",
    },
  ],
  [
    "issue_4457",
    {
      harness: "v_before.html",
      target: "angular_before.js",
      setup: ["before execute (1)", "before execute (2)"],
      workload: "f1",
    },
  ],
  [
    "issue_5457",
    {
      harness: "v_before.html",
      target: "v_before.html",
      setup: ["before execute (1)", "before execute (2)"],
      workload: "f1",
    },
  ],
  [
    "issue_7012",
    {
      harness: "v_before.html",
      target: "v_before.html",
      setup: ["before execute (1)", "before execute (2)"],
      workload: "f1",
    },
  ],
  [
    "issue_7735",
    {
      harness: "v_before.html",
      target: "angular_before.js",
      setup: ["before execute (1)", "before execute (2)"],
      workload: "f1",
    },
  ],
  [
    "issue_7759_3",
    {
      harness: "v_before.html",
      target: "v_before.html",
      setup: ["before execute"],
      workload: "f1",
    },
  ],
]);

function checkRoles(issueId: string, roles: PrepRoles | "unsupported"): PrepRoles {
  const expected = expectedRoles.get(issueId);
  if (expected === undefined || roles === "unsupported") {
    throw new Error(`role assignment failed for ${issueId}`);
  }

  const setup = roles.setup.map((item) => item.label);
  const matches =
    roles.harness.file === expected.harness &&
    roles.target.file === expected.target &&
    roles.target.kind === (expected.target === expected.harness ? "harness" : "separate-file") &&
    setup.length === expected.setup.length &&
    setup.every((label, index) => label === expected.setup[index]) &&
    roles.workload.label === expected.workload;
  if (!matches) {
    throw new Error(`unexpected roles for ${issueId}`);
  }

  return roles;
}

// 要件「setup と workload の span が、単体で parse できる」を確かめる。
// workload は関数式なので、式として parse するために括弧で包む。
function checkSpansParse(issueId: string, side: Side, files: FixtureFiles, roles: PrepRoles): void {
  const harness = files[roles.harness.file];
  if (harness === undefined) {
    throw new Error(`${issueId} ${side}: harness not found`);
  }

  for (const item of roles.setup) {
    try {
      parse(harness.slice(item.start, item.end), { sourceType: "script" });
    } catch (error) {
      throw new Error(`${issueId} ${side}: setup span "${item.label}" does not parse`, {
        cause: error,
      });
    }
  }

  try {
    parse(`(${harness.slice(roles.workload.start, roles.workload.end)})`, { sourceType: "script" });
  } catch (error) {
    throw new Error(`${issueId} ${side}: workload span does not parse`, { cause: error });
  }
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = parseManifest(
  JSON.parse(await readFile(resolve(repositoryRoot, "corpus/fixtures/manifest.json"), "utf8")),
);
const e2eCases = parseE2eCases(
  JSON.parse(await readFile(resolve(repositoryRoot, "corpus/e2e-cases.json"), "utf8")),
);

const expectedProfiles = new Map<string, Profile>();
for (const e2eCase of e2eCases) {
  expectedProfiles.set(e2eCase.id, e2eCase.profile);
}

let matched = 0;
const untested: string[] = [];

for (const issue of manifest.issues) {
  const fixtureRoot = resolve(repositoryRoot, issue.fixture);
  const fileNames = await readdir(fixtureRoot);
  const profile = detectProfile(fileNames);
  const expected = expectedProfiles.get(issue.id);

  if (profile === "unsupported") {
    throw new Error(`${issue.id}: profile is unsupported`);
  }

  const files = await readFixtureFiles(fixtureRoot);
  const roles = checkRoles(issue.id, detectRoles(profile, files, "before", issue.target));
  checkSpansParse(issue.id, "before", files, roles);

  // after 側は期待表を side で引き換えて照合する。両側で対象コードの選択が食い違わないことを見る。
  const afterRoles = detectRoles(profile, files, "after", issue.target);
  if (afterRoles === "unsupported") {
    throw new Error(`after role assignment failed for ${issue.id}`);
  }
  if (afterRoles.harness.file !== roles.harness.file.replace("before", "after")) {
    throw new Error(`${issue.id}: after harness does not correspond to before`);
  }
  if (afterRoles.target.file !== roles.target.file.replace("before", "after")) {
    throw new Error(`${issue.id}: after target does not correspond to before`);
  }
  if (afterRoles.target.kind !== roles.target.kind) {
    throw new Error(`${issue.id}: after target kind differs from before`);
  }
  checkSpansParse(issue.id, "after", files, afterRoles);

  console.log(
    `${issue.id}\t${profile}\tharness=${roles.harness.file}\ttarget=${roles.target.file}\tsetup=${roles.setup.map((item) => item.label).join(",")}\tworkload=${roles.workload.label}`,
  );

  if (expected === undefined) {
    untested.push(issue.id);
    continue;
  }

  if (expected !== profile) {
    throw new Error(`${issue.id}: profile mismatch (expected ${expected}, got ${profile})`);
  }

  matched += 1;
}

if (matched !== e2eCases.length) {
  throw new Error(`profile comparison failed: ${matched}/${e2eCases.length} matched`);
}

if (untested.length !== 1 || untested[0] !== "issue_1224") {
  throw new Error(`unexpected untested fixtures: ${untested.join(", ")}`);
}

console.log(`matched ${matched}/${e2eCases.length}; not compared: ${untested[0]}`);
