// --- Arg definition types ---

interface BooleanArgDef {
  type: "boolean";
  description: string;
}

interface StringArgDef {
  type: "string";
  description: string;
  default?: string;
  choices?: readonly string[];
}

interface NumberArgDef {
  type: "number";
  description: string;
  default?: number;
  validate?: (v: number) => string | null;
}

export type ArgDef = BooleanArgDef | StringArgDef | NumberArgDef;

// --- Type-level inference from arg definitions ---

export type InferArg<T extends ArgDef> =
  T extends { type: "boolean" } ? boolean
    : T extends { type: "string"; choices: readonly (infer C extends string)[]; default: string }
      ? C
    : T extends { type: "string"; choices: readonly (infer C extends string)[] }
      ? C | null
    : T extends { type: "string"; default: string } ? string
    : T extends { type: "string" } ? string | null
    : T extends { type: "number"; default: number } ? number
    : T extends { type: "number" } ? number | null
    : never;

export type InferArgs<T extends Record<string, ArgDef>> = {
  [K in keyof T]: InferArg<T[K]>;
};

// --- Command configuration ---

export interface CommandConfig<T extends Record<string, ArgDef>> {
  description: string;
  usage?: string;
  epilog?: string;
  args: T;
  validate?: (args: InferArgs<T>) => string | null;
  run: (args: InferArgs<T>) => Promise<void> | void;
}

export interface StoredCommand {
  description: string;
  usage?: string;
  epilog?: string;
  args: Record<string, ArgDef>;
  validate?: (args: Record<string, unknown>) => string | null;
  run: (args: Record<string, unknown>) => Promise<void> | void;
}

// --- Parse result (for testing / programmatic use) ---

export type ParseResult =
  | { type: "command"; command: string; args: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "help"; command: string | null };

// --- CLI options ---

export interface CliOptions {
  name: string;
  description: string;
  defaultCommand?: string;
}
