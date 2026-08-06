export const STATUSES = ["ok", "unsupported", "error"] as const;
export type Status = (typeof STATUSES)[number];

export const REACHES = [
  "parseable",
  "setup_resolved",
  "target_reached",
  "workload_executed",
  "observable",
] as const;
export type Reach = (typeof REACHES)[number];

export const VERDICTS = ["equal", "not_equal", "inconclusive"] as const;
export type Verdict = (typeof VERDICTS)[number];
