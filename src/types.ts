// A parsed CODERULE annotation found in the codebase.
export interface CodeRule {
  // The rule text after "CODERULE:"
  text: string;
  // File where the rule was found
  file: string;
  // Line number where the rule was found (1-based)
  line: number;
  // Optional glob path mask
  pathMask: string | null;
}

// A single violation found by the AI.
export interface Violation {
  description: string;
  file: string;
  code_snippet: string;
}

// The structured response from the AI for a single rule check.
export interface RuleCheckResult {
  violated: boolean;
  confidence: number;
  explanation: string;
  violations: Violation[];
}

// A reported issue combining the rule source and the AI finding.
export interface ReportedIssue {
  rule: CodeRule;
  result: RuleCheckResult;
}

// CLI options for the check command.
export interface CheckOptions {
  agentic: boolean;
  model: string;
  baseCommit: string | null;
  staged: boolean;
  confidenceThreshold: number;
  maxWorkers: number;
  repo: string;
  outputFormat: "text" | "json" | "github";
  quiet: boolean;
  verbose: boolean;
}

// The JSON schema used for structured AI output.
export const RULE_CHECK_SCHEMA = {
  type: "object" as const,
  properties: {
    violated: { type: "boolean" as const },
    confidence: { type: "number" as const },
    explanation: { type: "string" as const },
    violations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          description: { type: "string" as const },
          file: { type: "string" as const },
          code_snippet: { type: "string" as const },
        },
        required: ["description", "file", "code_snippet"] as const,
        additionalProperties: false,
      },
    },
  },
  required: ["violated", "confidence", "explanation", "violations"] as const,
  additionalProperties: false,
};

// GitHub PR review comment format.
export interface GitHubReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

// GitHub PR review payload.
export interface GitHubReviewPayload {
  body: string;
  event: "COMMENT";
  comments: GitHubReviewComment[];
}

// Default model to use.
export const DEFAULT_MODEL = "claude-sonnet-4-6";

// Default confidence threshold.
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

// Default max workers for parallel checks.
export const DEFAULT_MAX_WORKERS = 5;
