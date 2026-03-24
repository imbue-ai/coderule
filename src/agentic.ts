import type { CodeRule, RuleCheckResult } from "./types.ts";
import { RULE_CHECK_SCHEMA } from "./types.ts";

const AGENTIC_PROMPT_TEMPLATE =
  `You are a code reviewer. Your task is to check whether a code rule has been violated by the changes on the current branch.

=== RULE ===
{rule_text}
=== END RULE ===

The diff for the current branch is below. You also have access to the Read, Grep, and Glob tools to explore the codebase for additional context if needed.

=== DIFF BEGIN (unified diff; lines starting with \`-\` are removed and \`+\` are added) ===
{unified_diff}
=== DIFF END ===

Analyze the diff and determine whether it violates the rule stated above.
Use the available tools to read relevant files if the diff alone is not sufficient to determine compliance.
Only report violations that were introduced by the diff. Do not report pre-existing issues.
It is perfectly fine to report no violations if the diff does not violate the rule.`;

/** Build the prompt for agentic mode. */
export function buildAgenticPrompt(
  ruleText: string,
  diff: string,
): string {
  return AGENTIC_PROMPT_TEMPLATE
    .replace("{rule_text}", ruleText)
    .replace("{unified_diff}", diff);
}

/** Check that `claude` CLI is available on PATH. */
export async function checkClaudeAvailable(): Promise<boolean> {
  try {
    const cmd = new Deno.Command("claude", {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    });
    const result = await cmd.output();
    return result.success;
  } catch {
    return false;
  }
}

/** Check a single rule using Claude Code in agentic mode. */
export async function checkRuleAgentic(
  rule: CodeRule,
  diff: string,
  model: string,
  repoPath: string,
): Promise<RuleCheckResult> {
  const prompt = buildAgenticPrompt(rule.text, diff);
  const schemaJson = JSON.stringify(RULE_CHECK_SCHEMA);

  const cmd = new Deno.Command("claude", {
    args: [
      "-p",
      "--output-format",
      "json",
      "--model",
      model,
      "--allowedTools",
      "Read",
      "Grep",
      "Glob",
      "--permission-mode",
      "bypassPermissions",
      "--json-schema",
      schemaJson,
      prompt,
    ],
    cwd: repoPath,
    stdout: "piped",
    stderr: "piped",
  });

  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`Claude Code subprocess failed: ${stderr}`);
  }

  const output = new TextDecoder().decode(result.stdout);
  const data = JSON.parse(output);

  // Claude Code --output-format json wraps the result
  const resultText = data.result;
  if (!resultText) {
    throw new Error("No result field in Claude Code output");
  }

  return JSON.parse(resultText) as RuleCheckResult;
}
