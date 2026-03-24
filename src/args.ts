import { parseArgs as parse } from "@std/cli/parse-args";
import type { CheckOptions } from "./types.ts";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_WORKERS,
  DEFAULT_MODEL,
} from "./types.ts";

export type Command =
  | { type: "check"; options: CheckOptions }
  | { type: "list"; all: boolean }
  | { type: "error"; message: string };

export function parseArgs(args: string[]): Command {
  // Extract subcommand (first positional arg)
  const subcommand = args.length > 0 && !args[0].startsWith("--")
    ? args[0]
    : null;
  const rest = subcommand ? args.slice(1) : args;

  if (subcommand === "list") {
    const flags = parse(rest, { boolean: ["all"] });
    return { type: "list", all: flags.all ?? false };
  }

  if (subcommand && subcommand !== "check") {
    return { type: "error", message: `Unknown command: ${subcommand}` };
  }

  return parseCheckArgs(rest);
}

function parseCheckArgs(args: string[]): Command {
  const flags = parse(args, {
    boolean: ["agentic", "staged", "quiet", "verbose"],
    string: ["model", "base-commit", "repo", "output-format"],
    default: {
      agentic: false,
      staged: false,
      quiet: false,
      verbose: false,
      model: DEFAULT_MODEL,
      repo: ".",
      "output-format": "text",
    },
  });

  // Reject unknown flags
  const known = new Set([
    "_", "agentic", "staged", "quiet", "verbose",
    "model", "base-commit", "baseCommit",
    "repo", "output-format", "outputFormat",
    "confidence-threshold", "confidenceThreshold",
    "max-workers", "maxWorkers",
  ]);
  for (const key of Object.keys(flags)) {
    if (!known.has(key)) {
      return { type: "error", message: `Unknown option: --${key}` };
    }
  }

  const outputFormat = flags["output-format"] as string;
  if (!["text", "json", "github"].includes(outputFormat)) {
    return { type: "error", message: `Invalid output format: ${outputFormat}` };
  }

  // Parse confidence-threshold
  let confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD;
  if (flags["confidence-threshold"] !== undefined) {
    const val = parseFloat(String(flags["confidence-threshold"]));
    if (isNaN(val) || val < 0 || val > 1) {
      return {
        type: "error",
        message: "--confidence-threshold must be between 0.0 and 1.0",
      };
    }
    confidenceThreshold = val;
  }

  // Parse max-workers
  let maxWorkers = DEFAULT_MAX_WORKERS;
  if (flags["max-workers"] !== undefined) {
    const val = parseInt(String(flags["max-workers"]), 10);
    if (isNaN(val) || val < 1) {
      return {
        type: "error",
        message: "--max-workers must be a positive integer",
      };
    }
    maxWorkers = val;
  }

  if (flags.staged && flags["base-commit"]) {
    return {
      type: "error",
      message: "--staged and --base-commit are mutually exclusive",
    };
  }

  const options: CheckOptions = {
    agentic: flags.agentic,
    model: flags.model as string,
    baseCommit: (flags["base-commit"] as string) || null,
    staged: flags.staged,
    confidenceThreshold,
    maxWorkers,
    repo: flags.repo as string,
    outputFormat: outputFormat as "text" | "json" | "github",
    quiet: flags.quiet,
    verbose: flags.verbose,
  };

  return { type: "check", options };
}
