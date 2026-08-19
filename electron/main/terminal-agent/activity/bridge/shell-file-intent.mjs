const MAX_COMMAND_LENGTH = 64 * 1024;
const MAX_PATHS = 32;

const SHELL_TOOL_NAMES = new Set([
  "bash",
  "exec_command",
  "shell",
  "terminal",
  "unified_exec",
]);

const SIMPLE_READ_COMMANDS = new Set([
  "cat",
  "file",
  "nl",
  "stat",
  "strings",
  "wc",
]);

/**
 * Project only literal file operands from a deliberately small set of
 * read-only shell commands. This is an observability hint, not a shell parser:
 * any syntax whose path depends on expansion or process state fails closed.
 */
export function projectShellReadPaths(toolName, toolInput) {
  if (!SHELL_TOOL_NAMES.has(String(toolName).toLowerCase())) return [];
  if (!isRecord(toolInput) || typeof toolInput.command !== "string") return [];
  return extractShellReadPaths(toolInput.command);
}

export function extractShellReadPaths(command) {
  const tokens = tokenizeLiteralShell(command);
  if (!tokens) return [];
  const segments = splitCommandSegments(tokens);
  if (segments.some((segment) => commandName(segment) === "cd")) return [];

  const paths = [];
  for (const segment of segments) {
    paths.push(...readPathsForSegment(segment));
    if (paths.length >= MAX_PATHS) break;
  }
  return Array.from(new Set(paths)).slice(0, MAX_PATHS);
}

function readPathsForSegment(segment) {
  const tokens = stripLeadingAssignments(segment);
  const name = commandName(tokens);
  if (!name) return [];
  if (SIMPLE_READ_COMMANDS.has(name)) {
    return literalPaths(simpleOperands(tokens, name));
  }
  if (name === "head" || name === "tail") {
    return literalPaths(headOrTailOperands(tokens));
  }
  if (name === "od") {
    return literalPaths(odOperands(tokens));
  }
  if (name === "grep" || name === "rg") {
    return literalPaths(searchOperands(tokens));
  }
  if (name === "sed") {
    return literalPaths(sedOperands(tokens));
  }
  return [];
}

function simpleOperands(tokens, name) {
  const operands = [];
  let optionsEnded = false;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!optionsEnded && token === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && token.startsWith("-")) {
      if (name === "stat" && ["-f", "--format", "--printf"].includes(token)) index += 1;
      continue;
    }
    operands.push(token);
  }
  return operands;
}

function headOrTailOperands(tokens) {
  const operands = [];
  let optionsEnded = false;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!optionsEnded && token === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && ["-c", "-n", "--bytes", "--lines", "--sleep-interval", "--pid"].includes(token)) {
      index += 1;
      continue;
    }
    if (!optionsEnded && token.startsWith("-")) continue;
    operands.push(token);
  }
  return operands;
}

function odOperands(tokens) {
  const operands = [];
  let optionsEnded = false;
  const valueOptions = new Set(["-A", "-j", "-N", "-S", "-t", "-w", "--address-radix", "--skip-bytes", "--read-bytes", "--strings", "--format", "--width"]);
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!optionsEnded && token === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && valueOptions.has(token)) {
      index += 1;
      continue;
    }
    if (!optionsEnded && token.startsWith("-")) continue;
    operands.push(token);
  }
  return operands;
}

function searchOperands(tokens) {
  const name = commandName(tokens);
  const flagOptions = new Set([
    "-c", "-h", "-H", "-i", "-l", "-L", "-n", "-q", "-s", "-v", "-w", "-x",
    "--count", "--files-with-matches", "--files-without-match", "--fixed-strings",
    "--hidden", "--ignore-case", "--line-number", "--no-heading", "--quiet", "--word-regexp",
  ]);
  const valueOptions = new Set([
    "-A", "-B", "-C", "-e", "-f", "-g", "-m", "-t", "-T",
    "--after-context", "--before-context", "--context", "--file", "--glob",
    "--max-count", "--regexp", "--type", "--type-not",
  ]);
  const positional = [];
  let optionsEnded = false;
  let patternProvidedByOption = false;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!optionsEnded && token === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && flagOptions.has(token)) continue;
    if (!optionsEnded && valueOptions.has(token)) {
      if (token === "-e" || token === "--regexp" || token === "-f" || token === "--file") {
        patternProvidedByOption = true;
      }
      index += 1;
      continue;
    }
    if (!optionsEnded && token.startsWith("-")) return [];
    positional.push(token);
  }
  if (!patternProvidedByOption) positional.shift();
  if (name === "rg" && positional.length === 0) return [];
  return positional;
}

function sedOperands(tokens) {
  const paths = [];
  const positional = [];
  let optionsEnded = false;
  let scriptProvidedByOption = false;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!optionsEnded && token === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && (/^-i/u.test(token) || token.startsWith("--in-place"))) return [];
    if (!optionsEnded && /^-[nErsuz]+$/u.test(token)) continue;
    if (!optionsEnded && ["--quiet", "--silent", "--regexp-extended", "--separate", "--unbuffered", "--null-data"].includes(token)) {
      continue;
    }
    if (!optionsEnded && (token === "-e" || token === "--expression")) {
      if (tokens[index + 1] === undefined) return [];
      scriptProvidedByOption = true;
      index += 1;
      continue;
    }
    if (!optionsEnded && (/^-e.+/u.test(token) || token.startsWith("--expression="))) {
      scriptProvidedByOption = true;
      continue;
    }
    if (!optionsEnded && (token === "-f" || token === "--file")) {
      const scriptPath = tokens[index + 1];
      if (scriptPath === undefined) return [];
      paths.push(scriptPath);
      scriptProvidedByOption = true;
      index += 1;
      continue;
    }
    if (!optionsEnded && /^-f.+/u.test(token)) {
      paths.push(token.slice(2));
      scriptProvidedByOption = true;
      continue;
    }
    if (!optionsEnded && token.startsWith("--file=")) {
      paths.push(token.slice("--file=".length));
      scriptProvidedByOption = true;
      continue;
    }
    if (!optionsEnded && token.startsWith("-")) return [];
    positional.push(token);
  }
  if (!scriptProvidedByOption) positional.shift();
  return [...paths, ...positional];
}

function literalPaths(values) {
  return values.filter((value) => (
    typeof value === "string"
    && value.length > 0
    && value.length <= 4_096
    && value !== "-"
    && value !== "/dev/null"
    && !value.startsWith("-")
    && !value.includes("://")
    && !/[\0-\x1f\x7f$`*?\[\]{}~]/u.test(value)
  ));
}

function tokenizeLiteralShell(command) {
  if (typeof command !== "string" || command.length === 0 || command.length > MAX_COMMAND_LENGTH) {
    return null;
  }
  const tokens = [];
  let current = "";
  let quote = null;
  const pushCurrent = () => {
    if (!current) return;
    tokens.push(current);
    current = "";
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote === "'") {
      if (character === "'") quote = null;
      else current += character;
      continue;
    }
    if (quote === '"') {
      if (character === '"') {
        quote = null;
        continue;
      }
      if (character === "$" || character === "`") return null;
      if (character === "\\") {
        const next = command[index + 1];
        if (next === undefined) return null;
        current += next;
        index += 1;
        continue;
      }
      current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "\\") {
      const next = command[index + 1];
      if (next === undefined || next === "\n") return null;
      current += next;
      index += 1;
      continue;
    }
    if (character === "$" || character === "`" || character === "(" || character === ")" || character === "<" || character === ">") {
      return null;
    }
    if (/\s/u.test(character)) {
      pushCurrent();
      if (character === "\n") tokens.push(";");
      continue;
    }
    if (character === ";" || character === "|") {
      pushCurrent();
      if (command[index + 1] === character) {
        tokens.push(character + character);
        index += 1;
      } else {
        tokens.push(character);
      }
      continue;
    }
    if (character === "&") {
      pushCurrent();
      if (command[index + 1] !== "&") return null;
      tokens.push("&&");
      index += 1;
      continue;
    }
    current += character;
  }
  if (quote) return null;
  pushCurrent();
  return tokens;
}

function splitCommandSegments(tokens) {
  const segments = [];
  let segment = [];
  for (const token of tokens) {
    if ([";", "|", "||", "&&"].includes(token)) {
      if (segment.length > 0) segments.push(segment);
      segment = [];
      continue;
    }
    segment.push(token);
  }
  if (segment.length > 0) segments.push(segment);
  return segments;
}

function stripLeadingAssignments(tokens) {
  const result = [...tokens];
  while (/^[A-Za-z_][A-Za-z0-9_]*=[^$`]*$/u.test(result[0] ?? "")) result.shift();
  return result;
}

function commandName(tokens) {
  const token = stripLeadingAssignments(tokens)[0];
  return typeof token === "string" ? token.split("/").at(-1)?.toLowerCase() ?? null : null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
