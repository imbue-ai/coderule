import Anthropic from "@anthropic-ai/sdk";
import type { CheckOptions, CodeRule, ReportedIssue } from "../types.ts";
import { discoverRules, isRuleActive } from "../git/rules.ts";
import {
  extractChangedFiles,
  getBaseCommit,
  getDiff,
  stripBinaryDiffs,
} from "../git/diff.ts";
import { checkRuleNonAgentic } from "./anthropic.ts";
import { checkClaudeAvailable, checkRuleAgentic } from "./agentic.ts";

export type CheckResult =
  | { status: "no_rules" }
  | { status: "no_changes" }
  | { status: "no_active_rules" }
  | { status: "missing_api_key" }
  | { status: "missing_claude" }
  | { status: "done"; issues: ReportedIssue[]; diff: string };

export interface Logger {
  info(msg: string): void;
  verbose(msg: string): void;
}

// Run the check pipeline, returning a result instead of calling process.exit.
export async function runCheck(
  options: CheckOptions,
  log: Logger,
): Promise<CheckResult> {
  if (options.agentic) {
    if (!(await checkClaudeAvailable())) {
      return { status: "missing_claude" };
    }
  } else {
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return { status: "missing_api_key" };
    }
  }

  const repoPath = options.repo;

  log.info("Discovering rules...");
  const allRules = await discoverRules(repoPath);
  if (allRules.length === 0) return { status: "no_rules" };
  log.verbose(`Found ${allRules.length} rule(s) total.`);

  log.info("Getting diff...");
  const base = await getBaseCommit(repoPath, options.baseCommit, options.staged);
  const rawDiff = await getDiff(repoPath, base, options.staged);
  const diff = stripBinaryDiffs(rawDiff);

  if (!diff.trim()) return { status: "no_changes" };

  const changedFiles = extractChangedFiles(diff);
  const activeRules = allRules.filter((r) => isRuleActive(r, changedFiles));
  if (activeRules.length === 0) return { status: "no_active_rules" };
  log.info(`Checking ${activeRules.length} active rule(s)...`);

  const client = options.agentic
    ? null
    : new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  const issues = await runChecks(activeRules, diff, options, client, log);

  return { status: "done", issues, diff };
}

async function runChecks(
  rules: CodeRule[],
  diff: string,
  options: CheckOptions,
  client: Anthropic | null,
  log: Logger,
): Promise<ReportedIssue[]> {
  const issues: ReportedIssue[] = [];

  for (let i = 0; i < rules.length; i += options.maxWorkers) {
    const batch = rules.slice(i, i + options.maxWorkers);
    const results = await Promise.all(
      batch.map(async (rule) => {
        log.verbose(`  Checking: ${rule.file}:${rule.line} - ${rule.text}`);
        const start = Date.now();
        try {
          const result = options.agentic
            ? await checkRuleAgentic(rule, diff, options.model, options.repo)
            : await checkRuleNonAgentic(rule, diff, options.model, client!);

          log.verbose(
            `  Done (${Date.now() - start}ms): ${rule.text} → ${
              result.violated ? "VIOLATED" : "OK"
            }`,
          );

          if (
            result.violated &&
            result.confidence >= options.confidenceThreshold
          ) {
            return { rule, result } as ReportedIssue;
          }
        } catch (err) {
          log.info(
            `Error checking rule "${rule.text}": ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
        return null;
      }),
    );

    for (const r of results) {
      if (r) issues.push(r);
    }
  }

  return issues;
}
