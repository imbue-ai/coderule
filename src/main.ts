import { parseArgs } from "./args.ts";
import type { CheckOptions, CodeRule, ReportedIssue } from "./types.ts";
import { discoverRules, isRuleActive } from "./rules.ts";
import {
  extractChangedFiles,
  getBaseCommit,
  getDiff,
  stripBinaryDiffs,
} from "./diff.ts";
import { checkRuleNonAgentic } from "./checker.ts";
import { checkClaudeAvailable, checkRuleAgentic } from "./agentic.ts";
import { formatGitHub, formatJson, formatText } from "./output.ts";

async function main() {
  const command = parseArgs(Deno.args);

  if (command.type === "error") {
    console.error(`Error: ${command.message}`);
    Deno.exit(2);
  }

  if (command.type === "list") {
    await runList(command.all);
    return;
  }

  await runCheck(command.options);
}

async function runList(showAll: boolean) {
  const rules = await discoverRules(".");
  if (rules.length === 0) {
    console.log("No CODERULE annotations found.");
    return;
  }

  // If not --all, filter to active rules based on current diff
  let displayRules = rules;
  if (!showAll) {
    try {
      const base = await getBaseCommit(".", null, false);
      const diff = await getDiff(".", base, false);
      const changedFiles = extractChangedFiles(diff);
      displayRules = rules.filter((r) => isRuleActive(r, changedFiles));
    } catch {
      // If we can't get a diff, show all rules
      displayRules = rules;
    }
  }

  for (const rule of displayRules) {
    const mask = rule.pathMask ? ` [${rule.pathMask}]` : "";
    console.log(`${rule.file}:${rule.line}${mask}: ${rule.text}`);
  }
}

async function runCheck(options: CheckOptions) {
  // Validate prerequisites
  if (options.agentic) {
    if (!(await checkClaudeAvailable())) {
      console.error(
        "Error: `claude` CLI not found on PATH. Install Claude Code: https://docs.anthropic.com/en/docs/claude-code",
      );
      Deno.exit(2);
    }
  } else {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error(
        "Error: ANTHROPIC_API_KEY environment variable is not set.",
      );
      Deno.exit(2);
    }
  }

  const repoPath = options.repo;

  // Discover rules
  if (!options.quiet) console.error("Discovering rules...");
  const allRules = await discoverRules(repoPath);
  if (allRules.length === 0) {
    if (!options.quiet) console.error("No CODERULE annotations found.");
    Deno.exit(0);
  }
  if (options.verbose) {
    console.error(`Found ${allRules.length} rule(s) total.`);
  }

  // Get diff
  if (!options.quiet) console.error("Getting diff...");
  const base = await getBaseCommit(
    repoPath,
    options.baseCommit,
    options.staged,
  );
  const rawDiff = await getDiff(repoPath, base, options.staged);
  const diff = stripBinaryDiffs(rawDiff);

  if (!diff.trim()) {
    if (!options.quiet) console.error("No changes found.");
    Deno.exit(0);
  }

  // Filter to active rules
  const changedFiles = extractChangedFiles(diff);
  const activeRules = allRules.filter((r) => isRuleActive(r, changedFiles));
  if (activeRules.length === 0) {
    if (!options.quiet) {
      console.error("No active rules match the changed files.");
    }
    Deno.exit(0);
  }
  if (!options.quiet) {
    console.error(`Checking ${activeRules.length} active rule(s)...`);
  }

  // Check context window size for non-agentic mode
  if (!options.agentic && diff.length > 500_000) {
    console.error(
      "Error: Diff is too large for the model's context window. " +
        "Use a narrower --base-commit or switch to --agentic mode.",
    );
    Deno.exit(2);
  }

  // Run checks in parallel with max workers
  const issues = await runChecks(activeRules, diff, options);

  // Output results
  outputResults(issues, options);
  Deno.exit(issues.length > 0 ? 1 : 0);
}

async function runChecks(
  rules: CodeRule[],
  diff: string,
  options: CheckOptions,
): Promise<ReportedIssue[]> {
  const issues: ReportedIssue[] = [];
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";

  // Process rules in batches of maxWorkers
  for (let i = 0; i < rules.length; i += options.maxWorkers) {
    const batch = rules.slice(i, i + options.maxWorkers);
    const results = await Promise.all(
      batch.map(async (rule) => {
        if (options.verbose) {
          console.error(`  Checking: ${rule.file}:${rule.line} - ${rule.text}`);
        }
        const start = Date.now();
        try {
          const result = options.agentic
            ? await checkRuleAgentic(rule, diff, options.model, options.repo)
            : await checkRuleNonAgentic(rule, diff, options.model, apiKey);

          if (options.verbose) {
            console.error(
              `  Done (${Date.now() - start}ms): ${rule.text} → ${
                result.violated ? "VIOLATED" : "OK"
              }`,
            );
          }

          if (
            result.violated &&
            result.confidence >= options.confidenceThreshold
          ) {
            return { rule, result } as ReportedIssue;
          }
        } catch (err) {
          console.error(
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

function outputResults(issues: ReportedIssue[], options: CheckOptions) {
  let output: string;
  switch (options.outputFormat) {
    case "json":
      output = formatJson(issues);
      break;
    case "github":
      output = formatGitHub(issues);
      break;
    default:
      output = formatText(issues);
      break;
  }
  console.log(output);
}

main();
