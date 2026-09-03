import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { detectProfile } from "../../src/prep/profile.ts";
import type { Profile } from "../../src/types.ts";

type Manifest = {
  issues: readonly ManifestIssue[];
};

type ManifestIssue = {
  id: string;
  fixture: string;
};

type E2eCase = {
  id: string;
  profile: Profile;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isManifestIssue(value: unknown): value is ManifestIssue {
  return isRecord(value) && typeof value.id === "string" && typeof value.fixture === "string";
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
  const fileNames = await readdir(resolve(repositoryRoot, issue.fixture));
  const profile = detectProfile(fileNames);
  const expected = expectedProfiles.get(issue.id);

  if (expected === undefined) {
    untested.push(issue.id);
    console.log(`${issue.id}\t${profile}\tnot-compared`);
    continue;
  }

  if (expected !== profile) {
    console.log(`${issue.id}\t${profile}\tMISMATCH (expected ${expected})`);
    continue;
  }

  matched += 1;
  console.log(`${issue.id}\t${profile}\tmatch`);
}

if (matched !== e2eCases.length) {
  throw new Error(`profile comparison failed: ${matched}/${e2eCases.length} matched`);
}

if (untested.length !== 1 || untested[0] !== "issue_1224") {
  throw new Error(`unexpected untested fixtures: ${untested.join(", ")}`);
}

console.log(`matched ${matched}/${e2eCases.length}; not compared: ${untested[0]}`);
