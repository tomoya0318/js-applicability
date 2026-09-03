import type { Profile } from "../types.ts";

export function detectProfile(fileNames: readonly string[]): Profile | "unsupported" {
  // v_*.html を先に見ると、両方持つ fixture を browser と誤判定する。
  if (fileNames.some((fileName) => /^test_case_.*\.js$/.test(fileName))) {
    return "commonjs";
  }

  if (fileNames.some((fileName) => /^v_.*\.html$/.test(fileName))) {
    return "browser";
  }

  return "unsupported";
}
