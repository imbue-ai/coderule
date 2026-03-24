import { parseArgs } from "./args.ts";
import { discoverRules, isRuleActive } from "./rules.ts";
import { extractChangedFiles, getBaseCommit, getDiff } from "./diff.ts";
import { formatGitHub, formatJson, formatText } from "./output.ts";
import { runCheck } from "./check.ts";
import type { Logger } from "./check.ts";

async function main() {
  const command = parseArgs(Deno.args);

  if (command.type === "error") {
    console.error(`Error: ${command.message}`);
    Deno.exit(2);
  }

  if (command.type === "list") {
    await handleList(command.all);
    return;
  }

  const options = command.options;

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
    Deno.exit(0);
  } else if (result.status === "no_changes") {
    log.info("No changes found.");
    Deno.exit(0);
  } else if (result.status === "no_active_rules") {
    log.info("No active rules match the changed files.");
    Deno.exit(0);
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
}

async function handleList(showAll: boolean) {
  const rules = await discoverRules(".");
  if (rules.length === 0) {
    console.log("No CODERULE annotations found.");
    return;
  }

  let displayRules = rules;
  if (!showAll) {
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
}

main();
