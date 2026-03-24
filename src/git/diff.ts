import type { Result } from "../types.ts";

/** Get the base commit to diff against. */
export async function getBaseCommit(
  repoPath: string,
  baseCommit: string | null,
  staged: boolean,
): Promise<Result<string>> {
  if (baseCommit) return { ok: true, value: baseCommit };
  if (staged) return { ok: true, value: "HEAD" };

  // Auto-detect: find default branch via origin/HEAD
  let defaultBranch = "main";
  try {
    const cmd = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "origin/HEAD"],
      cwd: repoPath,
      stdout: "piped",
      stderr: "piped",
    });
    const result = await cmd.output();
    if (result.success) {
      const branch = new TextDecoder().decode(result.stdout).trim();
      if (branch && branch !== "origin/HEAD") {
        defaultBranch = branch;
      }
    }
  } catch {
    // Fall back to "main"
  }

  // Get merge base
  const cmd = new Deno.Command("git", {
    args: ["merge-base", defaultBranch, "HEAD"],
    cwd: repoPath,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    return { ok: false, error: `Failed to determine merge base against ${defaultBranch}: ${stderr}` };
  }
  return { ok: true, value: new TextDecoder().decode(result.stdout).trim() };
}

// Get the unified diff.
export async function getDiff(
  repoPath: string,
  baseCommit: string,
  staged: boolean,
): Promise<Result<string>> {
  // --staged: only staged changes vs HEAD
  // otherwise: diff base commit against working tree (includes uncommitted changes)
  const args = staged ? ["diff", "--staged"] : ["diff", baseCommit];

  const cmd = new Deno.Command("git", {
    args,
    cwd: repoPath,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    return { ok: false, error: `Failed to get diff: ${stderr}` };
  }
  return { ok: true, value: new TextDecoder().decode(result.stdout) };
}

// Strip binary file diffs from unified diff output.
export function stripBinaryDiffs(diff: string): string {
  const lines = diff.split("\n");
  const result: string[] = [];
  let skipUntilNextDiff = false;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      skipUntilNextDiff = false;
      result.push(line);
    } else if (
      line.startsWith("Binary files") ||
      line.includes("GIT binary patch")
    ) {
      skipUntilNextDiff = true;
      while (
        result.length > 0 &&
        !result[result.length - 1].startsWith("diff --git")
      ) {
        result.pop();
      }
      if (result.length > 0) result.pop();
    } else if (!skipUntilNextDiff) {
      result.push(line);
    }
  }

  return result.join("\n");
}

// Extract changed file paths from a unified diff.
export function extractChangedFiles(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    const match = line.match(/^(?:\+\+\+|---) [ab]\/(.+)$/);
    if (match) {
      files.add(match[1]);
    }
  }
  return [...files];
}

// Build a map of file -> added lines from a unified diff.
export function buildDiffLineMap(diff: string): Map<string, number[]> {
  const map = new Map<string, number[]>();
  let currentFile: string | null = null;
  let currentLine = 0;

  for (const line of diff.split("\n")) {
    const fileMatch = line.match(/^\+\+\+ [ab]\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!map.has(currentFile)) map.set(currentFile, []);
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (currentFile === null) continue;

    if (line.startsWith("+")) {
      map.get(currentFile)!.push(currentLine);
      currentLine++;
    } else if (line.startsWith("-")) {
      // Deleted lines don't advance the new-file line counter
    } else {
      currentLine++;
    }
  }

  return map;
}

// Find the best matching line number for a code snippet in the diff.
// Tries each line of the snippet against added lines in the given file.
export function findSnippetLine(
  diff: string,
  file: string,
  snippet: string,
): number | null {
  if (!snippet.trim()) return null;

  const searchTerms = snippet
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (searchTerms.length === 0) return null;

  const diffLines = diff.split("\n");
  let currentFile: string | null = null;
  let currentLine = 0;

  for (const line of diffLines) {
    const fileMatch = line.match(/^\+\+\+ [ab]\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (currentFile !== file) continue;

    if (line.startsWith("+")) {
      const content = line.substring(1);
      if (searchTerms.some((term) => content.includes(term))) {
        return currentLine;
      }
      currentLine++;
    } else if (line.startsWith("-")) {
      // Deleted lines don't advance new-file counter
    } else {
      currentLine++;
    }
  }

  return null;
}
