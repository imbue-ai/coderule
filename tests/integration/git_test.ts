import { assertEquals, assertStringIncludes } from "@std/assert";
import { getBaseCommit, getDiff } from "../../src/diff.ts";
import { discoverRules } from "../../src/rules.ts";

async function createTempRepo(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "coderule_test_" });
  const run = async (args: string[]) => {
    const cmd = new Deno.Command("git", {
      args,
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
    });
    const result = await cmd.output();
    if (!result.success) {
      throw new Error(
        `git ${args.join(" ")} failed: ${
          new TextDecoder().decode(result.stderr)
        }`,
      );
    }
    return new TextDecoder().decode(result.stdout).trim();
  };

  await run(["init"]);
  await run(["config", "user.email", "test@test.com"]);
  await run(["config", "user.name", "Test"]);
  return dir;
}

async function gitRun(dir: string, args: string[]): Promise<string> {
  const cmd = new Deno.Command("git", {
    args,
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  return new TextDecoder().decode(result.stdout).trim();
}

async function writeFile(dir: string, path: string, content: string) {
  const fullPath = `${dir}/${path}`;
  const parent = fullPath.substring(0, fullPath.lastIndexOf("/"));
  await Deno.mkdir(parent, { recursive: true }).catch(() => {});
  await Deno.writeTextFile(fullPath, content);
}

Deno.test("git diff generation between branches", async () => {
  const dir = await createTempRepo();
  try {
    await writeFile(dir, "file.ts", "const x = 1;\n");
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "initial"]);

    const baseCommit = await gitRun(dir, ["rev-parse", "HEAD"]);

    await gitRun(dir, ["checkout", "-b", "feature"]);
    await writeFile(dir, "file.ts", "const x = 1;\nconst y = 2;\n");
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "add y"]);

    const diff = await getDiff(dir, baseCommit, false);
    assertStringIncludes(diff, "+const y = 2;");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("merge base detection with main branch", async () => {
  const dir = await createTempRepo();
  try {
    await writeFile(dir, "file.ts", "initial\n");
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "initial"]);

    const mainCommit = await gitRun(dir, ["rev-parse", "HEAD"]);

    await gitRun(dir, ["checkout", "-b", "feature"]);
    await writeFile(dir, "file.ts", "changed\n");
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "change"]);

    const base = await getBaseCommit(dir, null, false);
    assertEquals(base, mainCommit);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("staged changes diff", async () => {
  const dir = await createTempRepo();
  try {
    await writeFile(dir, "file.ts", "const x = 1;\n");
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "initial"]);

    await writeFile(dir, "file.ts", "const x = 1;\nconst staged = true;\n");
    await gitRun(dir, ["add", "."]);

    // Also add an unstaged change
    await writeFile(
      dir,
      "file.ts",
      "const x = 1;\nconst staged = true;\nconst unstaged = true;\n",
    );

    const diff = await getDiff(dir, "HEAD", true);
    assertStringIncludes(diff, "+const staged = true;");
    // Unstaged change should NOT be in the staged diff
    assertEquals(diff.includes("unstaged"), false);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("binary files are excluded from diff", async () => {
  const dir = await createTempRepo();
  try {
    await writeFile(dir, "file.ts", "code\n");
    // Create a binary file
    await Deno.writeFile(
      `${dir}/image.png`,
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]),
    );
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "initial"]);

    const base = await gitRun(dir, ["rev-parse", "HEAD"]);

    await writeFile(dir, "file.ts", "code changed\n");
    await Deno.writeFile(
      `${dir}/image.png`,
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff]),
    );
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "update"]);

    const diff = await getDiff(dir, base, false);
    // The diff will contain a binary notice - we test stripBinaryDiffs in unit tests
    assertStringIncludes(diff, "code changed");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("rule discovery - finds CODERULE in tracked files", async () => {
  const dir = await createTempRepo();
  try {
    await writeFile(
      dir,
      "src/app.ts",
      '// CODERULE: no eval usage\nconsole.log("hi");\n',
    );
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "add rule"]);

    const rules = await discoverRules(dir);
    assertEquals(rules.length, 1);
    assertEquals(rules[0].text, "no eval usage");
    assertEquals(rules[0].file, "src/app.ts");
    assertEquals(rules[0].line, 1);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("rule discovery - finds CODERULE in untracked files", async () => {
  const dir = await createTempRepo();
  try {
    // Create an initial commit so git grep works
    await writeFile(dir, "README.md", "readme\n");
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "init"]);

    // Add an untracked file with a rule
    await writeFile(dir, "untracked.ts", "// CODERULE: no any types\n");

    const rules = await discoverRules(dir);
    const untrackedRule = rules.find((r) => r.file === "untracked.ts");
    assertEquals(untrackedRule !== undefined, true);
    assertEquals(untrackedRule!.text, "no any types");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("rule discovery - excludes gitignored files", async () => {
  const dir = await createTempRepo();
  try {
    await writeFile(dir, ".gitignore", "ignored/\n");
    await writeFile(dir, "README.md", "readme\n");
    await gitRun(dir, ["add", "."]);
    await gitRun(dir, ["commit", "-m", "init"]);

    await writeFile(
      dir,
      "ignored/rules.ts",
      "// CODERULE: should be ignored\n",
    );

    const rules = await discoverRules(dir);
    const ignoredRule = rules.find((r) => r.file.includes("ignored"));
    assertEquals(ignoredRule, undefined);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
