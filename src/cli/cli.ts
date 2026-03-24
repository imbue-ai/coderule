import { parseArgs as stdParse } from "@std/cli/parse-args";
import type { ArgDef, CliOptions, CommandConfig, ParseResult, StoredCommand } from "./types.ts";

export type { ArgDef, CommandConfig, InferArgs, ParseResult } from "./types.ts";

export class Cli {
  private opts: CliOptions;
  private commands = new Map<string, StoredCommand>();

  constructor(opts: CliOptions) {
    this.opts = opts;
  }

  command<const T extends Record<string, ArgDef>>(
    name: string,
    config: CommandConfig<T>,
  ): this {
    this.commands.set(name, config as unknown as StoredCommand);
    return this;
  }

  parse(rawArgs: string[]): ParseResult {
    if (
      rawArgs.includes("--help") &&
      (rawArgs.length === 1 || rawArgs[0] === "--help")
    ) {
      return { type: "help", command: null };
    }

    const first = rawArgs[0];
    let cmdName: string;
    let cmdArgs: string[];

    if (!first || first.startsWith("-")) {
      cmdName = this.opts.defaultCommand ?? "";
      cmdArgs = rawArgs;
    } else if (this.commands.has(first)) {
      cmdName = first;
      cmdArgs = rawArgs.slice(1);
    } else {
      return { type: "error", message: `Unknown command: ${first}` };
    }

    const cmd = this.commands.get(cmdName);
    if (!cmd) return { type: "error", message: `Unknown command: ${cmdName}` };

    if (cmdArgs.includes("--help")) {
      return { type: "help", command: cmdName };
    }

    const result = this.parseCommandArgs(cmd, cmdArgs);
    if (typeof result === "string") return { type: "error", message: result };

    if (cmd.validate) {
      const err = cmd.validate(result);
      if (err) return { type: "error", message: err };
    }
    return { type: "command", command: cmdName, args: result };
  }

  async run(rawArgs: string[]): Promise<void> {
    const result = this.parse(rawArgs);
    if (result.type === "help") {
      console.log(this.helpText(result.command));
      return;
    }
    if (result.type === "error") {
      console.error(`Error: ${result.message}`);
      Deno.exit(2);
    }
    const cmd = this.commands.get(result.command)!;
    await cmd.run(result.args);
  }

  helpText(command: string | null): string {
    if (command === null) return this.mainHelp();
    const cmd = this.commands.get(command);
    if (!cmd) return this.mainHelp();
    return this.commandHelp(command, cmd);
  }

  private parseCommandArgs(
    cmd: StoredCommand,
    rawArgs: string[],
  ): Record<string, unknown> | string {
    const booleans: string[] = [];
    const strings: string[] = [];
    const defaults: Record<string, unknown> = {};

    for (const [key, def] of Object.entries(cmd.args)) {
      const flag = camelToKebab(key);
      if (def.type === "boolean") {
        booleans.push(flag);
        defaults[flag] = false;
      } else if (def.type === "string") {
        strings.push(flag);
        if (def.default !== undefined) defaults[flag] = def.default;
      } else {
        strings.push(flag);
      }
    }

    const flags = stdParse(rawArgs, { boolean: booleans, string: strings, default: defaults });

    const known = new Set<string>(["_"]);
    for (const key of Object.keys(cmd.args)) {
      known.add(key);
      known.add(camelToKebab(key));
    }
    for (const key of Object.keys(flags)) {
      if (!known.has(key)) return `Unknown option: --${key}`;
    }

    const result: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(cmd.args)) {
      const flag = camelToKebab(key);
      const raw = flags[flag] ?? flags[key];

      if (def.type === "boolean") {
        result[key] = raw ?? false;
      } else if (def.type === "string") {
        if (raw === undefined) {
          result[key] = def.default ?? null;
        } else {
          if (def.choices && !def.choices.includes(raw as string)) {
            return `Invalid value for --${flag}: ${raw} (must be one of: ${def.choices.join(", ")})`;
          }
          result[key] = raw;
        }
      } else {
        if (raw === undefined || raw === "") {
          result[key] = def.default ?? null;
        } else {
          const val = Number(raw);
          if (isNaN(val)) return `--${flag} must be a number`;
          if (def.validate) {
            const err = def.validate(val);
            if (err) return `--${flag} ${err}`;
          }
          result[key] = val;
        }
      }
    }
    return result;
  }

  private mainHelp(): string {
    const lines = [
      `${this.opts.name} — ${this.opts.description}`,
      "",
      `Usage: ${this.opts.name} [command] [options]`,
      "",
      "Commands:",
    ];
    for (const [name, cmd] of this.commands) {
      const tag = name === this.opts.defaultCommand ? " (default)" : "";
      lines.push(`  ${name.padEnd(10)} ${cmd.description}${tag}`);
    }
    lines.push("", "Options:", "  --help    Show help for a command", "");
    lines.push(
      `Run '${this.opts.name} <command> --help' for details on a specific command.`,
    );
    return lines.join("\n");
  }

  private commandHelp(name: string, cmd: StoredCommand): string {
    const lines = [
      `${this.opts.name} ${name} — ${cmd.description}`,
      "",
      `Usage: ${cmd.usage ?? `${this.opts.name} ${name} [options]`}`,
      "",
      "Options:",
    ];
    for (const [key, def] of Object.entries(cmd.args)) {
      let label = `--${camelToKebab(key)}`;
      if (def.type === "string") label += ` <${camelToKebab(key)}>`;
      else if (def.type === "number") label += " <n>";

      let desc = def.description;
      if (def.type !== "boolean" && "default" in def && def.default !== undefined) {
        desc += ` (default: ${def.default})`;
      }
      lines.push(`  ${label.padEnd(28)} ${desc}`);
    }
    lines.push(`  ${"--help".padEnd(28)} Show this help`);
    if (cmd.epilog) lines.push("", cmd.epilog);
    return lines.join("\n");
  }
}

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export function defineCli(opts: CliOptions): Cli {
  return new Cli(opts);
}
