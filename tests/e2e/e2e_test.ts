import { assertEquals, assertStringIncludes } from "@std/assert";

const E2E_ENABLED = Deno.env.get("CODERULE_E2E") === "1";

async function createFixtureRepo(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "coderule_e2e_" });
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
  };

  await run(["init"]);
  await run(["config", "user.email", "test@test.com"]);
  await run(["config", "user.name", "Test"]);
  return dir;
}

async function writeFile(dir: string, path: string, content: string) {
  const fullPath = `${dir}/${path}`;
  const parent = fullPath.substring(0, fullPath.lastIndexOf("/"));
  await Deno.mkdir(parent, { recursive: true }).catch(() => {});
  await Deno.writeTextFile(fullPath, content);
}

async function gitRun(dir: string, args: string[]) {
  const cmd = new Deno.Command("git", {
    args,
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  if (!result.success) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
}

async function runCoderule(
  dir: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const mainPath = new URL("../../src/main.ts", import.meta.url).pathname;
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-run",
      "--allow-read",
      "--allow-env",
      "--allow-net",
      mainPath,
      ...args,
    ],
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
    env: Deno.env.toObject(),
  });
  const result = await cmd.output();
  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

Deno.test({
  name: "e2e: repo with violated rule exits 1",
  ignore: !E2E_ENABLED,
  async fn() {
    const dir = await createFixtureRepo();
    try {
      // Initial commit with a rule
      await writeFile(
        dir,
        "rules.ts",
        "// CODERULE: Do not use console.log in production code\n",
      );
      await writeFile(dir, "app.ts", "function main() {}\n");
      await gitRun(dir, ["add", "."]);
      await gitRun(dir, ["commit", "-m", "initial"]);

      // Create a branch that violates the rule
      await gitRun(dir, ["checkout", "-b", "feature"]);
      await writeFile(
        dir,
        "app.ts",
        'function main() {\n  console.log("debug");\n}\n',
      );
      await gitRun(dir, ["add", "."]);
      await gitRun(dir, ["commit", "-m", "add console.log"]);

      const result = await runCoderule(dir, [
        "--base-commit",
        "main",
        "--output-format",
        "json",
      ]);
      assertEquals(result.code, 1);
      const output = JSON.parse(result.stdout);
      assertEquals(output.issues.length > 0, true);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "e2e: repo with no violations exits 0",
  ignore: !E2E_ENABLED,
  async fn() {
    const dir = await createFixtureRepo();
    try {
      await writeFile(
        dir,
        "rules.ts",
        "// CODERULE: Do not use eval()\n",
      );
      await writeFile(dir, "app.ts", "function main() {}\n");
      await gitRun(dir, ["add", "."]);
      await gitRun(dir, ["commit", "-m", "initial"]);

      await gitRun(dir, ["checkout", "-b", "feature"]);
      await writeFile(
        dir,
        "app.ts",
        "function main() {\n  return 42;\n}\n",
      );
      await gitRun(dir, ["add", "."]);
      await gitRun(dir, ["commit", "-m", "safe change"]);

      const result = await runCoderule(dir, ["--base-commit", "main"]);
      assertEquals(result.code, 0);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "e2e: repo with no changes exits 0",
  ignore: !E2E_ENABLED,
  async fn() {
    const dir = await createFixtureRepo();
    try {
      await writeFile(
        dir,
        "app.ts",
        "// CODERULE: no eval\nfunction main() {}\n",
      );
      await gitRun(dir, ["add", "."]);
      await gitRun(dir, ["commit", "-m", "initial"]);

      const result = await runCoderule(dir, ["--base-commit", "HEAD"]);
      assertEquals(result.code, 0);
      assertStringIncludes(result.stderr, "No changes");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "e2e: coderule list shows discovered rules",
  ignore: !E2E_ENABLED,
  async fn() {
    const dir = await createFixtureRepo();
    try {
      await writeFile(
        dir,
        "src/rules.ts",
        "// CODERULE: no any types\n// CODERULE[src/**/*.ts]: use strict mode\n",
      );
      await gitRun(dir, ["add", "."]);
      await gitRun(dir, ["commit", "-m", "add rules"]);

      const result = await runCoderule(dir, ["list", "--all"]);
      assertEquals(result.code, 0);
      assertStringIncludes(result.stdout, "no any types");
      assertStringIncludes(result.stdout, "use strict mode");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
