import { globToRegExp } from "@std/path";
import type { CodeRule } from "../types.ts";

const CODERULE_PATTERN = /CODERULE(?:\[([^\]]*)\])?\s*:\s*(.+)/;

// Parse a single line into a CodeRule, returning null if no match.
export function parseCodeRuleLine(
  line: string,
  file: string,
  lineNumber: number,
): CodeRule | null {
  const match = line.match(CODERULE_PATTERN);
  if (!match) return null;

  const pathMask = match[1]?.trim() || null;
  const text = match[2].trim();

  return { text, file, line: lineNumber, pathMask };
}

// Parse grep output (file:line:content) into CodeRules.
export function parseGrepOutput(output: string): CodeRule[] {
  const rules: CodeRule[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const secondColon = line.indexOf(":", colonIdx + 1);
    if (secondColon === -1) continue;

    const file = line.substring(0, colonIdx);
    const lineNumStr = line.substring(colonIdx + 1, secondColon);
    const lineNum = parseInt(lineNumStr, 10);
    if (isNaN(lineNum)) continue;

    const content = line.substring(secondColon + 1);
    const rule = parseCodeRuleLine(content, file, lineNum);
    if (rule) rules.push(rule);
  }
  return rules;
}

// Discover all CODERULE annotations in the repository.
export async function discoverRules(repoPath: string): Promise<CodeRule[]> {
  const rules: CodeRule[] = [];

  // 1. Search tracked files with git grep
  try {
    const gitGrep = new Deno.Command("git", {
      args: ["grep", "-n", "CODERULE"],
      cwd: repoPath,
      stdout: "piped",
      stderr: "piped",
    });
    const result = await gitGrep.output();
    if (result.success) {
      const output = new TextDecoder().decode(result.stdout);
      rules.push(...parseGrepOutput(output));
    }
  } catch {
    // git grep failure is non-fatal
  }

  // 2. Search untracked files (but not gitignored)
  try {
    const untrackedCmd = new Deno.Command("git", {
      args: ["ls-files", "--others", "--exclude-standard"],
      cwd: repoPath,
      stdout: "piped",
      stderr: "piped",
    });
    const untrackedResult = await untrackedCmd.output();
    if (untrackedResult.success) {
      const files = new TextDecoder()
        .decode(untrackedResult.stdout)
        .split("\n")
        .filter((f) => f.trim());

      for (const file of files) {
        try {
          const content = await Deno.readTextFile(`${repoPath}/${file}`);
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const rule = parseCodeRuleLine(lines[i], file, i + 1);
            if (rule) rules.push(rule);
          }
        } catch {
          // Skip files that can't be read (binary, permissions, etc.)
        }
      }
    }
  } catch {
    // ls-files failure is non-fatal
  }

  return rules;
}

// Check if a rule is active given the list of changed files.
export function isRuleActive(
  rule: CodeRule,
  changedFiles: string[],
): boolean {
  if (!rule.pathMask) return true;
  return changedFiles.some((file) => matchGlob(rule.pathMask!, file));
}

// Match a file path against a glob pattern using @std/path.
export function matchGlob(pattern: string, path: string): boolean {
  const re = globToRegExp(pattern, { extended: true, globstar: true });
  return re.test(path);
}
