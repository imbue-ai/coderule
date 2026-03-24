import { defineCli } from "./cli/cli.ts";
import { discoverRules, isRuleActive } from "./git/rules.ts";
import { extractChangedFiles, getBaseCommit, getDiff } from "./git/diff.ts";
import { formatGitHub, formatJson, formatText } from "./review/output.ts";
import { runCheck } from "./review/check.ts";
import type { Logger } from "./review/check.ts";
import type { CheckOptions } from "./types.ts";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_WORKERS,
  DEFAULT_MODEL,
} from "./config.ts";

export const cli = defineCli({
  name: "coderule",
  description: "codebase-specific agentic code reviews",
  defaultCommand: "check",
})
  .command("check", {
    description: "Run rule checks against the current diff",
    usage: "coderule [check] [options]",
    epilog: [
      "Exit codes:",
      "  0  No violations found",
      "  1  One or more violations found",
      "  2  Error (bad arguments, API failure, etc.)",
    ].join("\n"),
    args: {
      agentic: { type: "boolean", description: "Use Claude Code for agentic review" },
      model: { type: "string", default: DEFAULT_MODEL, description: "Model to use" },
      baseCommit: {
        type: "string",
        description: "Git ref to diff against (default: auto-detect)",
      },
      staged: { type: "boolean", description: "Only check staged changes" },
      confidenceThreshold: {
        type: "number",
        default: DEFAULT_CONFIDENCE_THRESHOLD,
        description: "Min confidence 0.0-1.0",
        validate: (v) =>
          v >= 0 && v <= 1 ? null : "must be between 0.0 and 1.0",
      },
      maxWorkers: {
        type: "number",
        default: DEFAULT_MAX_WORKERS,
        description: "Parallel rule checks",
        validate: (v) =>
          Number.isInteger(v) && v >= 1
            ? null
            : "must be a positive integer",
      },
      repo: { type: "string", default: ".", description: "Repository path" },
      outputFormat: {
        type: "string",
        default: "text" as const,
        description: "Output: text, json, github",
        choices: ["text", "json", "github"],
      },
      quiet: { type: "boolean", description: "Suppress status messages" },
      verbose: { type: "boolean", description: "Show detailed progress" },
    },
    validate: (args) => {
      if (args.staged && args.baseCommit) {
        return "--staged and --base-commit are mutually exclusive";
      }
      return null;
    },
    run: async (args) => {
      const options: CheckOptions = {
        agentic: args.agentic,
        model: args.model,
        baseCommit: args.baseCommit,
        staged: args.staged,
        confidenceThreshold: args.confidenceThreshold,
        maxWorkers: args.maxWorkers,
        repo: args.repo,
        outputFormat: args.outputFormat as CheckOptions["outputFormat"],
        quiet: args.quiet,
        verbose: args.verbose,
      };

      const log: Logger = {
        info: (msg) => { if (!options.quiet) console.error(msg); },
        verbose: (msg) => { if (options.verbose) console.error(msg); },
      };

      const result = await runCheck(options, log);

      if (result.status === "missing_claude") {
        console.error(
          "Error: `claude` CLI not found on PATH. Install Claude Code: https://docs.anthropic.com/en/docs/claude-code",
        );
        Deno.exit(2);
      } else if (result.status === "missing_api_key") {
        console.error(
          "Error: ANTHROPIC_API_KEY environment variable is not set.",
        );
        Deno.exit(2);
      } else if (result.status === "no_rules") {
        log.info("No CODERULE annotations found.");
      } else if (result.status === "no_changes") {
        log.info("No changes found.");
      } else if (result.status === "no_active_rules") {
        log.info("No active rules match the changed files.");
      } else {
        let output: string;
        switch (options.outputFormat) {
          case "json":
            output = formatJson(result.issues);
            break;
          case "github":
            output = formatGitHub(result.issues, result.diff);
            break;
          default:
            output = formatText(result.issues);
            break;
        }
        console.log(output);
        Deno.exit(result.issues.length > 0 ? 1 : 0);
      }
    },
  })
  .command("list", {
    description: "List active CODERULE annotations",
    args: {
      all: { type: "boolean", description: "Show all rules, not just active ones" },
    },
    run: async (args) => {
      const rules = await discoverRules(".");
      if (rules.length === 0) {
        console.log("No CODERULE annotations found.");
        return;
      }

      let displayRules = rules;
      if (!args.all) {
        try {
          const base = await getBaseCommit(".", null, false);
          const diff = await getDiff(".", base, false);
          const changedFiles = extractChangedFiles(diff);
          displayRules = rules.filter((r) => isRuleActive(r, changedFiles));
        } catch {
          displayRules = rules;
        }
      }

      for (const rule of displayRules) {
        const mask = rule.pathMask ? ` [${rule.pathMask}]` : "";
        console.log(`${rule.file}:${rule.line}${mask}: ${rule.text}`);
      }
    },
  });
