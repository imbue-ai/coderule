import Anthropic from "@anthropic-ai/sdk";
import type { CodeRule, RuleCheckResult } from "./types.ts";
import { RULE_CHECK_SCHEMA } from "./types.ts";

const NON_AGENTIC_PROMPT_TEMPLATE =
  `You are a code reviewer. Your task is to check whether a code rule has been violated by the changes in a diff.

=== RULE ===
{rule_text}
=== END RULE ===

=== DIFF BEGIN (unified diff; lines starting with \`-\` are removed and \`+\` are added) ===
{unified_diff}
=== DIFF END ===

Analyze the diff and determine whether it violates the rule stated above.

Only report violations that were introduced by the diff. Do not report pre-existing issues.
It is perfectly fine to report no violations if the diff does not violate the rule.`;

// Build the prompt for non-agentic mode.
export function buildNonAgenticPrompt(
  ruleText: string,
  diff: string,
): string {
  return NON_AGENTIC_PROMPT_TEMPLATE
    .replace("{rule_text}", ruleText)
    .replace("{unified_diff}", diff);
}

// Check a single rule using the Anthropic Messages API.
export async function checkRuleNonAgentic(
  rule: CodeRule,
  diff: string,
  model: string,
  apiKey: string,
): Promise<RuleCheckResult> {
  const prompt = buildNonAgenticPrompt(rule.text, diff);
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: RULE_CHECK_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in API response");
  }

  return JSON.parse(textBlock.text) as RuleCheckResult;
}
