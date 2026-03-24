/** Get the base commit to diff against. */
export async function getBaseCommit(
  repoPath: string,
  baseCommit: string | null,
  staged: boolean,
): Promise<string> {
  if (baseCommit) return baseCommit;
  if (staged) return "HEAD";

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
    throw new Error(
      `Failed to determine merge base against ${defaultBranch}: ${
        new TextDecoder().decode(result.stderr)
      }`,
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}

/** Get the unified diff. */
export async function getDiff(
  repoPath: string,
  baseCommit: string,
  staged: boolean,
): Promise<string> {
  const args = staged ? ["diff", "--staged"] : ["diff", `${baseCommit}..HEAD`];

  const cmd = new Deno.Command("git", {
    args,
    cwd: repoPath,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  if (!result.success) {
    throw new Error(
      `Failed to get diff: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
  return new TextDecoder().decode(result.stdout);
}

/** Strip binary file diffs from unified diff output. */
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
      // Remove the preceding "diff --git" line for this binary file
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

/** Extract changed file paths from a unified diff. */
export function extractChangedFiles(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    // Match +++ b/path/to/file or --- a/path/to/file
    const match = line.match(/^(?:\+\+\+|---) [ab]\/(.+)$/);
    if (match) {
      files.add(match[1]);
    }
  }
  return [...files];
}
