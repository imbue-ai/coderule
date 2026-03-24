import type {
  GitHubReviewComment,
  GitHubReviewPayload,
  ReportedIssue,
} from "./types.ts";

/** Format issues as human-readable text. */
export function formatText(issues: ReportedIssue[]): string {
  if (issues.length === 0) return "No violations found.";

  const lines: string[] = [];
  for (const issue of issues) {
    lines.push(`VIOLATION: ${issue.rule.file}:${issue.rule.line}`);
    lines.push(`  Rule: ${issue.rule.text}`);
    lines.push(`  Confidence: ${(issue.result.confidence * 100).toFixed(0)}%`);
    lines.push(`  Explanation: ${issue.result.explanation}`);
    for (const v of issue.result.violations) {
      lines.push(`  - ${v.description}`);
      lines.push(`    File: ${v.file}`);
      if (v.code_snippet) {
        lines.push(`    Snippet: ${v.code_snippet}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Format issues as JSON. */
export function formatJson(issues: ReportedIssue[]): string {
  const payload = {
    issues: issues.map((issue) => ({
      rule: {
        text: issue.rule.text,
        file: issue.rule.file,
        line: issue.rule.line,
        pathMask: issue.rule.pathMask,
      },
      violated: issue.result.violated,
      confidence: issue.result.confidence,
      explanation: issue.result.explanation,
      violations: issue.result.violations,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

/** Format issues as a GitHub PR review API payload. */
export function formatGitHub(issues: ReportedIssue[]): string {
  const comments: GitHubReviewComment[] = [];
  const bodyParts: string[] = [];

  for (const issue of issues) {
    for (const v of issue.result.violations) {
      if (v.file && v.file !== "") {
        // Try to extract line number from code_snippet or use 1
        const line = extractLineNumber(v.code_snippet) || 1;
        comments.push({
          path: v.file,
          line,
          side: "RIGHT",
          body:
            `**Rule** (${issue.rule.file}:${issue.rule.line}): ${issue.rule.text}\n\n${v.description}`,
        });
      } else {
        bodyParts.push(
          `- **${issue.rule.text}** (${issue.rule.file}:${issue.rule.line}): ${v.description}`,
        );
      }
    }
  }

  const summary = issues.length === 1
    ? "coderule found 1 violation"
    : `coderule found ${issues.length} violations`;

  const body = bodyParts.length > 0
    ? `${summary}\n\n${bodyParts.join("\n")}`
    : summary;

  const payload: GitHubReviewPayload = {
    body,
    event: "COMMENT",
    comments,
  };

  return JSON.stringify(payload, null, 2);
}

/** Try to extract a line number from a code snippet context. */
function extractLineNumber(snippet: string): number | null {
  // Look for patterns like "line 42" or ":42:" in the snippet
  const match = snippet.match(/(?:line\s+|:)(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}
